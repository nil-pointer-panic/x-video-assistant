"""Offline Chromium integration for theater mode: video and DOM continuity, overlay and SPA."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess, base64
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
VIDEOID='2114161811985698973'
HTML='''<!doctype html><html><head><style>
html,body { margin:0; font-family:Arial; }
header { height:110px; padding:16px; box-sizing:border-box; background:#e6e6e6; }
article { margin:0 auto 20px; width:560px; border:1px solid #ccc; padding:12px; box-sizing:border-box; }
[data-testid="videoPlayer"] {position:relative;width:480px;height:270px;background:#171717;overflow:hidden;transform:translateZ(0)}
video {width:100%;height:100%;object-fit:cover;background:#272727;}
[data-x="play"] {position:absolute;left:12px;bottom:12px;z-index:2}
[role="group"] {display:flex;height:36px;margin-top:8px;}
#after {height:1700px;background:#eee;}
</style></head><body>
<header>Header</header>
<article data-testid="tweet"><a href="/author/status/2114161811985698973"><time>now</time></a>
<div data-testid="videoPlayer" id="player"><video muted playsinline loop></video>
<button type="button" data-x="play" onclick="document.querySelector('video').paused?document.querySelector('video').play():document.querySelector('video').pause()">Play/Pause</button>
</div><div role="group"></div></article>
<div id="after"></div>
</body></html>'''

def check(page, cond, message):
  val=page.evaluate(cond)
  assert val, f'{message}: {val}'

def main():
  with TemporaryDirectory() as td:
    media=Path(td)/'sample.mp4'
    subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','testsrc=size=480x270:rate=24',
      '-t','6','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(media)],check=True)
    with sync_playwright() as pw:
      browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
        args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
      page=browser.new_page(viewport={'width':1280,'height':820})
      errors=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.set_content(HTML)
      page.evaluate("window.chrome={i18n:{getUILanguage:()=> 'zh-CN'},runtime:{onMessage:{addListener:()=>{}},sendMessage:async()=>({ok:true,result:{}})}}")
      page.add_script_tag(content=(ROOT/'i18n.js').read_text())
      page.add_script_tag(content=(ROOT/'quality.js').read_text())
      page.add_script_tag(content=(ROOT/'content.js').read_text())
      page.locator('.xvq-theater-launch').wait_for(timeout=4000)
      assert page.locator('.xvq-theater-launch').count()==1
      assert page.locator('.xvq-button').count()==1, 'original download button was removed'
      assert page.locator('.xvq-theater-launch').get_attribute('aria-label')=='网页内放大播放'
      assert page.locator('.xvq-theater-launch').is_visible(), 'button must show without hover'
      page.evaluate("""(src) => { let v=document.querySelector('video'); window._originalVideo=v; v.src=src; v.volume=.37;v.muted=false; }""", 'data:video/mp4;base64,'+base64.b64encode(media.read_bytes()).decode())
      page.evaluate("document.querySelector('video').play()")
      page.wait_for_timeout(1100)
      before=page.evaluate("""() => {const v=document.querySelector('video');return {time:v.currentTime,volume:v.volume,muted:v.muted,paused:v.paused}}""")
      assert before['time']>0 and not before['paused']
      page.screenshot(path='/mnt/data/X-Video-Quality-1.5.0-Before.png',full_page=False)
      page.evaluate('window.scrollTo(0, 90)')
      page.wait_for_timeout(100)
      saved_scroll=page.evaluate('window.scrollY')
      assert saved_scroll > 0
      page.locator('.xvq-theater-launch').click()
      check(page,"document.querySelector('#player').matches(':popover-open')",'popover not open')
      check(page,"document.querySelector('video')===window._originalVideo",'video DOM replaced')
      box=page.locator('#player').bounding_box()
      assert abs(box['x']+box['width']/2-640)<2,box
      assert abs(box['y']+box['height']/2-410)<2,box
      assert box['width']<=1280*.85+1 and box['height']<=820*.85+1, box
      assert box['width']>650,box
      assert page.locator('.xvq-theater-launch').get_attribute('aria-label')=='关闭剧场模式'
      assert page.locator('video').evaluate('(v)=>v.currentTime') >= before['time']-.03
      assert page.locator('video').evaluate('(v)=>v.volume') == before['volume']
      page.screenshot(path='/mnt/data/X-Video-Quality-1.5.0-Theater.png',full_page=False)
      # Playback must continue and native control must remain usable in theater.
      time1=page.locator('video').evaluate('(v)=>v.currentTime')
      page.wait_for_timeout(650)
      assert page.locator('video').evaluate('(v)=>v.currentTime') > time1+.2
      page.locator('[data-x="play"]').click()
      assert page.locator('video').evaluate('(v)=>v.paused')
      page.locator('[data-x="play"]').click()
      assert not page.locator('video').evaluate('(v)=>v.paused')
      # Escape closes, preserves playback progress, scroll and settings.
      page.evaluate('window.scrollTo(0, 240)')
      page.keyboard.press('Escape')
      assert page.evaluate('window.scrollY') == saved_scroll
      check(page,"!document.querySelector('#player').matches(':popover-open')",'Esc failed')
      check(page,"document.querySelector('video')===window._originalVideo",'restored wrong video')
      assert page.locator('video').evaluate('(v)=>v.volume')==.37
      assert page.locator('video').evaluate('(v)=>!v.paused')
      assert page.locator('.xvq-theater-launch').get_attribute('aria-label')=='网页内放大播放'
      # Click outside closes without activating underlying page element.
      page.locator('.xvq-theater-launch').click()
      page.mouse.click(20,30)
      check(page,"!document.querySelector('#player').matches(':popover-open')",'backdrop click failed')
      # Viewport resize recalculates geometry.
      page.locator('.xvq-theater-launch').click()
      page.set_viewport_size({'width':820,'height':590})
      box=page.locator('#player').bounding_box()
      assert box['width']<=820*.85+1 and box['height']<=590*.85+1,box
      page.locator('.xvq-theater-launch').click()
      # Router updates should immediately clean up active theater.
      page.locator('.xvq-theater-launch').click()
      page.evaluate("history.pushState({}, '', '#route-next');window.dispatchEvent(new PopStateEvent('popstate'))")
      check(page,"!document.querySelector('#player').matches(':popover-open')",'SPA route cleanup failed')
      # React-like virtualized SPA removes original node while in top layer.
      page.set_viewport_size({'width':1280,'height':820})
      page.locator('.xvq-theater-launch').click()
      page.evaluate("document.querySelector('article').remove()")
      page.wait_for_timeout(150)
      page.evaluate("""() => {
        const article=document.createElement('article');article.dataset.testid='tweet';
        article.innerHTML='<a href="/new/status/2114161811985698999"><time>now</time></a><div data-testid="videoPlayer" style="width:480px;height:270px;background:black;position:relative"><video></video></div><div role="group"></div>';
        document.body.prepend(article);
      }""")
      page.locator('.xvq-theater-launch').wait_for(timeout=3500)
      assert page.locator('.xvq-theater-launch').count()==1
      assert page.locator('.xvq-button').count()==1
      print('PASS native Popover top-layer theater, state continuity, native controls, Esc, backdrop, resize, SPA cleanup, no duplicate, original downloads')
      assert not errors,errors
      browser.close()
if __name__=='__main__':main()
