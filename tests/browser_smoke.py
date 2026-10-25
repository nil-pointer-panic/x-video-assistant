"""Chromium DOM integration with X-like fixture. No external network/real downloads."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
ID='2114161811985698973'
OTHER='2114161811985698999'
URL=f'https://x.com/xiaohuiyuan/status/{ID}'
BASE=f'https://video.twimg.com/ext_tw_video/{ID}/pu/vid'
V360=f'{BASE}/640x360/a.mp4'
V720=f'{BASE}/1280x720/a.mp4'
V1080=f'{BASE}/1920x1080/a.mp4'
VIDEO={'durationMs':521000,'handle':'xiaohuiyuan','variants':[
 {'height':360,'width':640,'bitrate':832000,'url':V360},
 {'height':720,'width':1280,'bitrate':2176000,'url':V720},
 {'height':1080,'width':1920,'bitrate':5600000,'url':V1080}]}
FAKE_CHROME = r'''
window.__test = {stored:{languagePreference:'zh'}, messages:[], video:VIDEO, failBatch:false};
window.chrome = {
 storage:{local:{
  get:async key => {const k=typeof key==='string'?key:Object.keys(key)[0];return {[k]:window.__test.stored[k]};},
  set:async obj=> {Object.assign(window.__test.stored,obj);}
 }},
 runtime:{
  onMessage:{addListener:cb=>{window.__test.listener=cb;}},
  sendMessage:async m=>{
   window.__test.messages.push(m);
   if(m.type==='GET_VIDEOS')return {ok:true,result:{videos:[structuredClone(window.__test.video)],via:'模拟 X GraphQL'}};
   if(m.type==='GET_SIZES')return {ok:true,result:{sizes:m.urls.map((_,i)=>(i+1)*1048576)}};
   if(m.type==='DOWNLOAD')return {ok:true,result:{downloadId:17,filename:'X-Videos/demo.mp4'}};
   if(m.type==='CREATE_ZIP_JOB')return {ok:true,result:{count:m.items.length,tabId:17}};
   return {ok:false,error:'unexpected'};
  }
 },
 tabs:{
  query:async()=>[{id:1,url:URL}],
  sendMessage:async(id,m)=>m.type==='SNIFF_PAGE'? {ok:true,result:{items:[
   {id:'2114161811985698973',meta:{name:'晓辉博士',handle:'xiaohuiyuan',text:'今天聊聊 DeepSeek 开源框架 DeepInfer。',avatar:'https://pbs.twimg.com/profile_images/avatar_123_normal.jpg'},fallback:{mediaDetails:[]}},
   {id:'2114161811985698999',meta:{name:'AI 研究者',handle:'ai_dev',text:'第二条 AI 技术视频测试',avatar:''},fallback:{mediaDetails:[]}}
  ]}}:{ok:false,error:'unexpected tab request'}
 }
};
'''

def init(page):
    page.evaluate('([VIDEO, URL])=>{' + FAKE_CHROME + '}', [VIDEO, URL])
    page.add_script_tag(content=(ROOT/'i18n.js').read_text())
    page.add_script_tag(content=(ROOT/'quality.js').read_text())

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1150,'height':850})
  page.set_content('''<!doctype html><body><article data-testid="tweet">
   <a href="/xiaohuiyuan/status/2114161811985698973"><time>now</time></a>
   <div data-testid="User-Name"><a href="/xiaohuiyuan"><span>晓辉博士</span></a></div>
   <div data-testid="Tweet-User-Avatar"><img src="https://pbs.twimg.com/profile_images/avatar.jpg"></div>
   <div data-testid="tweetText">DeepSeek 推理框架开源分享。</div>
   <div data-testid="videoPlayer"><video></video></div><div role="group"></div></article></body>''')
  init(page);page.add_script_tag(content=(ROOT/'content.js').read_text())
  page.locator('.xvq-button').wait_for(timeout=4000)
  assert page.locator('.xvq-button').get_attribute('aria-label') == '下载视频 · 选择画质'
  page.evaluate('''([id,url])=>window.dispatchEvent(new MessageEvent('message',{
   source:window,origin:location.origin,data:{source:'__X_VIDEO_QUALITY_PAGE__',found:[{
    postId:id,handle:'xiaohuiyuan',meta:{name:'晓辉博士',handle:'xiaohuiyuan',text:'GraphQL 摘要',avatar:''},
    media:{id_str:'123456',video_info:{variants:[{url,content_type:'video/mp4'}]}}
   }]}
  }))''',[ID,V360])
  sniffed=page.evaluate('''()=>new Promise(resolve=>window.__test.listener({type:'SNIFF_PAGE'}, {}, resolve))''')
  assert sniffed['ok'] and len(sniffed['result']['items'])==1
  meta=sniffed['result']['items'][0]['meta']
  assert meta['name']=='晓辉博士' and meta['handle']=='xiaohuiyuan'
  assert meta['text']=='DeepSeek 推理框架开源分享。'
  assert len(sniffed['result']['items'][0]['fallback']['mediaDetails'])==1
  page.locator('.xvq-button').click()
  dialog=page.locator('#xvq-extension-root').locator('section.dialog');dialog.wait_for()
  assert dialog.locator('.variant').count()==3
  dialog.locator('select').select_option('720')
  assert page.evaluate("window.__test.stored.defaultQuality")=='720'
  dialog.locator('.variant').first.click()
  assert page.evaluate("window.__test.stored.defaultQuality")=='720'
  print('PASS in-tweet picker + GraphQL/DOM metadata + modal preference')
  hook=browser.new_page()
  hook.set_content('<!doctype html><body></body>')
  graphql={'data':{'tweetResult':{'result':{
    'rest_id':ID,
    'legacy':{'full_text':'推文原始内容：DeepInfer 开源'},
    'core':{'user_results':{'result':{'legacy':{'name':'晓辉博士','screen_name':'xiaohuiyuan','profile_image_url_https':'https://pbs.twimg.com/demo_normal.jpg'}}}},
    'extended_entities':{'media':[{'id_str':'123456','video_info':{'variants':[{'url':'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/a.mp4','content_type':'video/mp4','bitrate':800000}]}}]}
  }}}}
  hook.evaluate("""data=>{
    window._posts=[];
    window.postMessage=(data,origin)=>window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data}));
    window.addEventListener('message',e=>{if(e.data?.source==='__X_VIDEO_QUALITY_PAGE__')window._posts.push(...e.data.found)});
    window.fetch=async()=>({ok:true,headers:{get:()=> '8000'},clone(){return {json:async()=>data}}});
  }""",graphql)
  hook.add_script_tag(content=(ROOT/'page-hook.js').read_text())
  hook.evaluate("fetch('https://x.com/i/api/graphql/abcd')")
  hook.wait_for_function('window._posts.length >= 1',timeout=2500)
  parsed=hook.evaluate('window._posts[0]')
  assert parsed['postId']==ID
  assert parsed['meta']['name']=='晓辉博士' and parsed['meta']['handle']=='xiaohuiyuan'
  assert parsed['meta']['text']=='推文原始内容：DeepInfer 开源'
  print('PASS real page-hook parsing of simulated X GraphQL JSON metadata')


  popup=browser.new_page(viewport={'width':440,'height':600})
  markup=(ROOT/'popup.html').read_text().replace('<link rel="stylesheet" href="popup.css">','<style>'+(ROOT/'popup.css').read_text()+'</style>')
  markup=markup.replace('<script src="i18n.js"></script><script src="quality.js"></script><script src="popup.js"></script>','')
  popup.route('https://pbs.twimg.com/**',lambda route: route.fulfill(
    status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#cbd5e1"/><circle cx="32" cy="25" r="12" fill="#64748b"/><path d="M10 62Q10 40 32 40T54 62" fill="#64748b"/></svg>'))
  popup.set_content(markup);init(popup);popup.add_script_tag(content=(ROOT/'popup.js').read_text())
  assert popup.locator('body').evaluate('(el)=>getComputedStyle(el).width')=='418px'
  popup.locator('#defaultQuality').select_option('720')
  popup.locator('#sniff').click()
  popup.locator('.post-card').nth(1).wait_for(timeout=3000)
  assert popup.locator('.post-card').count()==2
  assert popup.locator('.avatar').count()==2
  popup.wait_for_function("document.querySelector('.avatar img')?.naturalWidth > 0")
  assert '晓辉博士' in popup.locator('.post-card').first.inner_text()
  assert 'DeepInfer' in popup.locator('.post-card').first.inner_text()
  assert 'AI 研究者' in popup.locator('.post-card').last.inner_text()
  assert popup.locator('.video-quality').count()==2
  assert popup.locator('.video-quality').first.input_value()=='1'  # 720p
  # One video can override global setting; other video remains 720p.
  popup.locator('.video-quality').first.select_option('0')
  assert popup.locator('#defaultQuality').input_value()=='720'
  popup.locator('.video-check').first.check()
  assert '打包 ZIP (1)' in popup.locator('#batch').inner_text()
  popup.locator('#select-all').check()
  assert popup.locator('.video-check:checked').count()==2
  popup.locator('#batch').click()
  assert '已打开打包页' in popup.locator('.batch-summary').inner_text()
  bulk=popup.evaluate("window.__test.messages.filter(x=>x.type==='CREATE_ZIP_JOB')")
  assert len(bulk)==1 and len(bulk[0]['items'])==2
  assert bulk[0]['items'][0]['url']==V360 and bulk[0]['items'][1]['url']==V720
  assert popup.locator('.video-check:checked').count()==2
  assert popup.locator('#defaultQuality').input_value()=='720'
  # Reproduce Chrome's ~600px popup: large result list must scroll completely.
  popup.evaluate('''() => {
    const list=document.querySelector('#result .result-list');
    const original=list.querySelector('.post-card');
    for(let i=0;i<18;i++)list.appendChild(original.cloneNode(true));
    list.scrollTop=list.scrollHeight;
  }''')
  popup.wait_for_timeout(100)
  popup.evaluate('document.documentElement.scrollTop=document.documentElement.scrollHeight')
  last=popup.evaluate('''() => {
    const el=document.querySelector('#result .result-list');
    const toolbar=document.querySelector('#result .batchbar');
    const last=el.querySelector('.post-card:last-child');
    return {viewport:document.documentElement.clientHeight, scroll:el.scrollTop,
      lastBottom:last.getBoundingClientRect().bottom, scrollBottom:el.getBoundingClientRect().bottom,
      listTop:el.getBoundingClientRect().top, toolbarBottom:toolbar.getBoundingClientRect().bottom,
      rootScroll:document.scrollingElement.scrollHeight>document.documentElement.clientHeight};
  }''')
  assert last['scroll']>0, last
  assert last['lastBottom']<last['scrollBottom']+1, last
  assert last['listTop'] >= last['toolbarBottom'] - 1, last
  assert last['scrollBottom']<=600, last
  assert last['rootScroll'] is True, last
  popup.evaluate('document.querySelectorAll("#result .post-card").forEach((x,i)=>{if(i>1)x.remove()})')
  popup.screenshot(path='/mnt/data/X-Video-Quality-1.4.0-Preview.png',full_page=True)
  popup.emulate_media(color_scheme='dark')
  assert popup.locator('body').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(23, 23, 23)'
  popup.screenshot(path='/mnt/data/X-Video-Quality-1.4.0-Dark.png',full_page=True)
  popup.emulate_media(color_scheme='light')
  popup.locator('#otherModes summary').click()
  popup.locator('#url').fill(URL)
  popup.locator('#search').click()
  popup.locator('.post-card').first.wait_for()
  assert popup.locator('.post-card').count()==1
  popup.locator('.download-one').click()
  assert popup.evaluate("window.__test.messages.filter(x=>x.type==='DOWNLOAD').length")==1 # popup only; modal has a separate mocked page
  print('PASS popup avatar, author, excerpt, select-all, ZIP job, individual download, persistence, light/dark')
  browser.close()
if __name__=='__main__':main()
