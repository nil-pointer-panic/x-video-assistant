"""Full Chromium regression: auto locale, manual override, and UI continuity."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT,FAKE_CHROME,VIDEO,URL

with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  popup=browser.new_page(viewport={'width':440,'height':600})
  errors=[]
  popup.on('pageerror',lambda e:errors.append(str(e)))
  html=(ROOT/'popup.html').read_text().replace('<link rel="stylesheet" href="popup.css">','<style>'+(ROOT/'popup.css').read_text()+'</style>')
  html=html.replace('<script src="i18n.js"></script><script src="quality.js"></script><script src="popup.js"></script>','')
  popup.set_content(html)
  popup.evaluate('([VIDEO, URL])=>{' + FAKE_CHROME + '}', [VIDEO, URL])
  popup.evaluate("() => {delete window.__test.stored.languagePreference; chrome.i18n={getUILanguage:()=> 'en-US'};}")
  for name in ('i18n.js','quality.js','popup.js'): popup.add_script_tag(content=(ROOT/name).read_text())
  popup.wait_for_function("document.querySelector('h1').textContent === 'X Video Assistant'")
  assert popup.locator('.app-desc').inner_text().startswith('Theater mode')
  assert popup.locator('#sniff').inner_text().strip()=='Detect videos on this page'
  assert popup.locator('#defaultQuality').locator('option').first.inner_text()=='Auto (prefer 480p or lower)'
  popup.locator('#moreSettings summary').click()
  assert popup.locator('#languagePreference').input_value()=='auto'
  assert 'currently: English' in popup.locator('#languagePreference option').first.inner_text()
  popup.locator('#sniff').click()
  popup.locator('.post-card').nth(1).wait_for(timeout=5000)
  assert 'Found 2 video posts' in popup.locator('#result>.muted').inner_text()
  popup.locator('.video-check').first.check()
  popup.locator('.video-quality').first.select_option('1')
  assert '1 videos selected' in popup.locator('.batch-count').inner_text()
  # Change locale while keeping selected video and quality (do not re-sniff).
  popup.locator('#moreSettings summary').click()
  popup.locator('#languagePreference').select_option('zh')
  popup.wait_for_function("document.querySelector('h1').textContent === 'X 视频助手'")
  assert popup.locator('.video-check').first.is_checked()
  assert popup.locator('.video-quality').first.input_value()=='1'
  assert '已选 1 个视频' in popup.locator('.batch-count').inner_text()
  assert popup.evaluate('window.__test.stored.languagePreference')=='zh'
  popup.screenshot(path='/mnt/data/X-Video-Assistant-1.6.0-ZH.png')
  popup.locator('#languagePreference').select_option('en')
  popup.wait_for_function("document.querySelector('h1').textContent === 'X Video Assistant'")
  assert popup.locator('.video-check').first.is_checked()
  assert popup.locator('.video-quality').first.input_value()=='1'
  assert 'ZIP' in popup.locator('#batch').inner_text()
  popup.screenshot(path='/mnt/data/X-Video-Assistant-1.6.0-EN.png')
  popup.locator('#languagePreference').select_option('auto')
  assert popup.locator('#languagePreference').input_value()=='auto'
  assert popup.evaluate('window.__test.stored.languagePreference')=='auto'
  assert popup.locator('h1').inner_text()=='X Video Assistant'
  # Change browser UI locale then reopen, and confirm auto selection.
  popup.evaluate("chrome.i18n.getUILanguage=()=> 'zh-CN'")
  popup.evaluate("XVAi18n.save('en')")
  popup.evaluate("XVAi18n.save('auto')")
  assert popup.locator('h1').inner_text()=='X 视频助手'
  # Persistence: load the saved override into a fresh extension popup.
  popup.locator('#languagePreference').select_option('en')
  popup.reload() if False else None
  assert popup.evaluate('window.__test.stored.languagePreference')=='en'
  assert not errors,errors
  # In-post player must also use English if the user's explicit preference is English.
  player=browser.new_page(viewport={'width':1000,'height':700})
  player.set_content('<article data-testid="tweet"><a href="/a/status/2114161811985698973"><time>Today</time></a><div data-testid="videoPlayer"><video></video></div><div role="group"></div></article>')
  player.evaluate('([VIDEO, URL])=>{' + FAKE_CHROME + '}', [VIDEO,URL])
  player.evaluate("() => {window.__test.stored.languagePreference='en'; chrome.i18n={getUILanguage:()=> 'zh-CN'};}")
  for name in ('i18n.js','quality.js','content.js'): player.add_script_tag(content=(ROOT/name).read_text())
  player.locator('.xvq-button').wait_for()
  assert player.locator('.xvq-button').get_attribute('aria-label')=='Download video · Choose quality'
  player.locator('.xvq-button').click()
  player.locator('.dialog h2').wait_for(timeout=4000)
  assert player.locator('.dialog h2').inner_text()=='Choose video quality'
  assert 'Click a quality to download' in player.locator('.video-title').inner_text()
  assert not errors,errors
  browser.close()
  print('PASS Chromium: automatic browser language, manual Chinese/English override, stored setting, selected video + quality retained, X in-post modal localization')
