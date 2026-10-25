"""ZIP export integration: Chromium module scripts, one save picker, real ZIP extraction."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64,io,zipfile,json,contextlib
ROOT=Path(__file__).resolve().parents[1]
JOB='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
SAMPLE=b'\x00\x00\x00\x18ftypmp42'+(bytes(range(256))*50)
URL='https://video.twimg.com/ext_tw_video/123/pu/vid/640x360/a.mp4'
SELECTED=[{'url':URL,'postId':str(2114161811985698973+i),'handle':f'demo{i}','quality':'360p','index':0} for i in range(3)]
def main():
 with contextlib.nullcontext():
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':860,'height':710})
   page.on('console',lambda msg:print('CONSOLE:',msg.type,msg.text))
   page.on('pageerror',lambda ex:print('PAGEERROR',str(ex)))
   page.evaluate('''(() => { const {selected,source}=''' + json.dumps({'selected':SELECTED,'source':list(SAMPLE)}) + ''';
    window.__fake={pickers:0,writes:[],closed:0,aborted:0,selected};
    window.chrome={storage:{local:{get:async()=>({languagePreference:'en'})}}};window.chrome.storage.session={
      get:async key=>({[key]:window.__fake.selected}),
      remove:async()=>{}
    };
    window.showSaveFilePicker=async options=>{window.__fake.pickers++;return {
      createWritable:async()=>({
        write:async chunk=>window.__fake.writes.push(Array.from(chunk)),
        close:async()=>{window.__fake.closed++;},
        abort:async()=>{window.__fake.aborted++;}
      })
    }};
    window.fetch=async(url,opts)=>({ok:true,status:200,body:new ReadableStream({start(controller){
      const b=Uint8Array.from(source);
      controller.enqueue(b.slice(0,12));controller.enqueue(b.slice(12));controller.close();
    }})});
   })();''')
   markup=(ROOT/'batch.html').read_text().replace('<link rel="stylesheet" href="batch.css">','<style>'+(ROOT/'batch.css').read_text()+'</style>')
   markup=markup.replace('<script type="module" src="batch.js"></script>','')
   page.set_content(markup)
   page.add_script_tag(content=(ROOT/'i18n.js').read_text())
   zipurl='data:text/javascript;base64,'+base64.b64encode((ROOT/'zip-stream.js').read_bytes()).decode()
   source=(ROOT/'batch.js').read_text().replace("from './zip-stream.js'",'from '+json.dumps(zipurl))
   source=source.replace("const key=new URLSearchParams(location.search).get('job');",'const key='+json.dumps(JOB)+';')
   page.add_script_tag(content=source,type='module')
   page.locator('#start').wait_for(state='visible')
   print('MSG:',page.locator('#message').inner_text(),'FILECOUNT:',page.locator('#filelist .file').count())
   assert page.locator('#filelist .file').count()==3
   assert not page.locator('#start').is_disabled()
   page.locator('#start').click()
   page.wait_for_function('window.__fake.closed===1',timeout=10000)
   calls=page.evaluate('window.__fake.pickers')
   assert calls==1,calls
   parts=page.evaluate('window.__fake.writes')
   output=b''.join(bytes(x) for x in parts)
   with zipfile.ZipFile(io.BytesIO(output)) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert len(names)==3,names
    for name in names:
     assert z.read(name)==SAMPLE
   assert 'Saved 3 videos' in page.locator('#message').inner_text()
   page.screenshot(path='/mnt/data/X-Video-Assistant-1.6.0-ZIP-EN.png',full_page=True)
   print('PASS Chromium ZIP export, exactly one save picker, streamed 3 MP4s, Python zipfile CRC and byte comparison')
   browser.close()

if __name__=='__main__':main()
