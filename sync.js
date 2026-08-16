/* RepForge provider-agnostic sync layer.
   Providers: Firebase/Firestore or Google Drive. Local-first remains the source of immediate UI state. */
(function(){
  const FB_KEY='repforge-firebase-config-v1', DRIVE_KEY='repforge-drive-config-v1', PROVIDER_KEY='repforge-sync-provider-v1';
  let auth=null, fs=null, user=null, timer=null, syncing=false, driveToken=null, driveTokenExpires=0, driveTokenClient=null;
  const $=id=>document.getElementById(id);
  const cfg=()=>{try{return JSON.parse(localStorage.getItem(FB_KEY)||'null')||window.REPFORGE_FIREBASE_CONFIG||null}catch{return window.REPFORGE_FIREBASE_CONFIG||null}};
  const driveCfg=()=>{try{return JSON.parse(localStorage.getItem(DRIVE_KEY)||'null')||null}catch{return null}};
  const provider=()=>localStorage.getItem(PROVIDER_KEY)||'local';
  const status=(text,cls='')=>{const el=$('syncStatus');if(el){el.textContent=text;el.className='syncStatus '+cls}};
  const saveCfg=c=>{localStorage.setItem(FB_KEY,JSON.stringify(c));location.reload()};
  const saveDriveCfg=c=>{localStorage.setItem(DRIVE_KEY,JSON.stringify(c));location.reload()};
  function setProvider(p){localStorage.setItem(PROVIDER_KEY,p);location.reload()}
  function configuredFirebase(){return !!(cfg()&&window.firebase)}
  function configuredDrive(){return !!driveCfg()?.clientId}
  function docId(x){return String(x).replaceAll('/','_')}
  function localWorkouts(){const a=[];for(const d of Object.keys(db.logs||{}))for(const [k] of EX)for(const e of db.logs[d]?.[k]||[])a.push({...e,date:d,exercise:k,deleted:false});return a}
  function removeLocalWorkout(id){for(const d of Object.keys(db.logs||{}))for(const [k] of EX)db.logs[d][k]=(db.logs[d][k]||[]).filter(e=>e.id!==id)}
  function mergeRemote(r){
    const by=new Map(localWorkouts().map(x=>[x.id,x]));
    for(const x of r.workouts||[]){const local=by.get(x.id);if(!local||Number(x.updatedAt||0)>Number(local.updatedAt||0)){if(x.deleted)removeLocalWorkout(x.id);else{if(!db.logs[x.date])db.logs[x.date]={};if(!db.logs[x.date][x.exercise])db.logs[x.date][x.exercise]=[];for(const d of Object.keys(db.logs))for(const [k] of EX){if(db.logs[d][k])db.logs[d][k]=db.logs[d][k].filter(e=>e.id!==x.id)};db.logs[x.date][x.exercise].push({...x});}}}
    for(const d of r.daily||[]){const local=db.daily?.[d.id];if(!local||Number(d.updatedAt||0)>Number(local.updatedAt||0)){if(d.deleted)delete db.daily[d.id];else db.daily[d.id]={rpe:d.rpe||'',note:d.note||'',updatedAt:d.updatedAt}}}
    for(const b of r.bulk||[]){const localTs=Number(db.bulkMeta?.[`${b.exercise}_${b.year}`]||0);if(Number(b.updatedAt||0)>localTs){if(b.deleted)delete db.bulk[b.exercise][b.year];else db.bulk[b.exercise][b.year]=Number(b.value||0);db.bulkMeta[`${b.exercise}_${b.year}`]=Number(b.updatedAt||0);}}
    if(r.settings&&Number(r.settings.updatedAt||0)>Number(db.targetDefaultsUpdatedAt||0)){db.targetDefaults={...db.targetDefaults,...(r.settings.targetDefaults||{})};db.theme=r.settings.theme||db.theme;db.targetDefaultsUpdatedAt=Number(r.settings.updatedAt)}
    for(const p of r.targets||[]){const i=(db.targetPeriods||[]).findIndex(x=>x.id===p.id);const local=i>=0?db.targetPeriods[i]:null;if(!local||Number(p.updatedAt||0)>Number(local.updatedAt||0)){if(p.deleted){if(i>=0)db.targetPeriods.splice(i,1)}else{const x={id:p.id,from:p.from,to:p.to||null,values:p.values||{},label:p.label||'Target period',updatedAt:p.updatedAt};if(i>=0)db.targetPeriods[i]=x;else db.targetPeriods.push(x)}}}
    for(const x of r.deletions||[])if(x.kind==='workout')removeLocalWorkout(x.id);
    db.schema=SCHEMA;localStorage.setItem(KEY,JSON.stringify(db));
  }
  async function pushFirebase(root){
    const ops=[];
    for(const x of localWorkouts())ops.push({ref:root.collection('workouts').doc(docId(x.id)),data:x});
    for(const x of Object.values(db.deletedEntries||{}))ops.push({ref:root.collection('workouts').doc(docId(x.id)),data:{id:x.id,deleted:true,updatedAt:x.updatedAt}});
    for(const [d,x] of Object.entries(db.daily||{}))ops.push({ref:root.collection('daily').doc(docId(d)),data:{rpe:x.rpe||'',note:x.note||'',updatedAt:x.updatedAt||Date.now()}});
    for(const [k] of EX)for(const [year,value] of Object.entries(db.bulk?.[k]||{}))ops.push({ref:root.collection('bulk').doc(docId(k+'_'+year)),data:{exercise:k,year,value:Number(value||0),updatedAt:Number(db.bulkMeta?.[`${k}_${year}`]||Date.now())}});
    for(const p of db.targetPeriods||[])ops.push({ref:root.collection('targetPeriods').doc(docId(p.id)),data:p});
    for(const x of Object.values(db.deletedTargets||{}))ops.push({ref:root.collection('targetPeriods').doc(docId(x.id)),data:{id:x.id,deleted:true,updatedAt:x.updatedAt}});
    ops.push({ref:root.collection('settings').doc('main'),data:{targetDefaults:db.targetDefaults,theme:db.theme,updatedAt:Number(db.targetDefaultsUpdatedAt||Date.now())}});
    for(let i=0;i<ops.length;i+=450){const batch=fs.batch();for(const op of ops.slice(i,i+450))batch.set(op.ref,op.data,{merge:true});await batch.commit()}
  }
  async function syncFirebase(){if(!user||!fs||syncing)return;syncing=true;status('Syncing…','busy');try{const root=fs.collection('users').doc(user.uid);const remote={workouts:[],daily:[],bulk:[],targets:[],settings:null,deletions:[]};for(const [key,out] of [['workouts','workouts'],['daily','daily'],['bulk','bulk'],['targetPeriods','targets']]){const snap=await root.collection(key).get();snap.forEach(d=>remote[out].push({id:d.id,...d.data()}))}const setSnap=await root.collection('settings').doc('main').get();if(setSnap.exists)remote.settings=setSnap.data();mergeRemote(remote);await pushFirebase(root);finishSync();}catch(e){console.error(e);failSync(e)}finally{syncing=false}}
  function initFirebase(){if(!configuredFirebase()){status('Firebase not configured','off');return}try{if(!firebase.apps.length)firebase.initializeApp(cfg());auth=firebase.auth();fs=firebase.firestore();auth.onAuthStateChanged(async u=>{user=u;if(u){showAccount(u.email||u.displayName||'Signed in');status('Syncing…','busy');await syncFirebase()}else{showSignedOut();status('Signed out','off')}})}catch(e){console.error(e);status('Firebase configuration error','error')}}
  function showSignedOut(){if($('syncEmail'))$('syncEmail').textContent='Not signed in';if($('syncEmail2'))$('syncEmail2').textContent='';$('signInBox').hidden=false;$('accountBox').hidden=true}
  function showAccount(email){$('syncEmail').textContent=email;$('syncEmail2').textContent=email;$('signInBox').hidden=true;$('accountBox').hidden=false;$('syncProviderText').textContent='Firebase / Firestore'}
  function finishSync(){db.syncMeta={lastSync:new Date().toISOString(),status:'synced',provider:provider()};localStorage.setItem(KEY,JSON.stringify(db));status('Synced','ok');$('syncStatusLarge').textContent='Your cloud copy is up to date.';$('lastSyncText').textContent=new Date().toLocaleString();$('syncStateText').textContent='Synced';renderAll()}
  function failSync(e){db.syncMeta={lastSync:db.syncMeta?.lastSync||null,status:'error',provider:provider()};localStorage.setItem(KEY,JSON.stringify(db));status('Sync error','error');$('syncStatusLarge').textContent='The last sync failed. Your local data is still safe.';$('syncStateText').textContent='Sync error'}
  async function firebaseSignUp(){const email=$('authEmail').value.trim(),pass=$('authPassword').value;if(!email||pass.length<6)return toast('Enter an email and a password of at least 6 characters');try{await auth.createUserWithEmailAndPassword(email,pass);toast('Account created')}catch(e){toast(e.message)}}
  async function firebaseSignIn(){try{await auth.signInWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value)}catch(e){toast(e.message)}}
  async function googleSignIn(){try{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())}catch(e){toast(e.message)}}
  async function reset(){const email=$('authEmail').value.trim();if(!email)return toast('Enter your email first');try{await auth.sendPasswordResetEmail(email);toast('Password reset email sent')}catch(e){toast(e.message)}}
  function driveTokenReady(){return driveToken&&Date.now()<driveTokenExpires-30000}
  function getDriveToken(){return new Promise((resolve,reject)=>{const c=driveCfg();if(!c?.clientId)return reject(new Error('Google Drive Client ID is not configured'));if(!window.google?.accounts?.oauth2)return reject(new Error('Google Identity Services did not load'));driveTokenClient=driveTokenClient||google.accounts.oauth2.initTokenClient({client_id:c.clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:resp=>{if(resp.error){reject(new Error(resp.error));return}driveToken=resp.access_token;driveTokenExpires=Date.now()+Number(resp.expires_in||3600)*1000;resolve(driveToken)}});if(driveTokenReady())resolve(driveToken);else driveTokenClient.requestAccessToken({prompt:driveToken?'':'consent'})})}
  async function driveFetch(url,opts={}){let token=await getDriveToken();let r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}});if(r.status===401){driveToken=null;token=await getDriveToken();r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}})}if(!r.ok)throw new Error(`Google Drive error ${r.status}`);return r}
  async function findDriveFile(){const q=encodeURIComponent("name = 'RepForge Cloud Data.json' and trashed = false");const r=await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)`);const j=await r.json();return j.files?.[0]||null}
  async function readDriveFile(file){const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);return r.json()}
  async function writeDriveFile(fileId,payload){const meta=JSON.stringify({name:'RepForge Cloud Data.json',mimeType:'application/json'});const body=JSON.stringify(payload);const boundary='repforge_boundary';const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const url=fileId?`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const r=await driveFetch(url,{method:fileId?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart});return r.json()}
  function mergeDriveDatabase(remote){if(!remote?.data)return;const x=normalizeDb(remote.data);mergeRemote({workouts:localWorkoutsFrom(x),daily:dailyFrom(x),bulk:bulkFrom(x),targets:x.targetPeriods||[],settings:{targetDefaults:x.targetDefaults,theme:x.theme,updatedAt:x.targetDefaultsUpdatedAt||0}})}
  function localWorkoutsFrom(x){const a=[];for(const d of Object.keys(x.logs||{}))for(const [k] of EX)for(const e of x.logs[d]?.[k]||[])a.push({...e,date:d,exercise:k,deleted:false});for(const x of Object.values(x.deletedEntries||{}))a.push({id:x.id,deleted:true,updatedAt:x.updatedAt});return a}
  function dailyFrom(x){return Object.entries(x.daily||{}).map(([id,v])=>({id,...v})).concat(Object.values(x.deletedDaily||{}).map(x=>({id:x.id,...x,deleted:true})))}
  function bulkFrom(x){const a=[];for(const [k] of EX)for(const [year,value] of Object.entries(x.bulk?.[k]||{}))a.push({id:`${k}_${year}`,exercise:k,year,value,updatedAt:Number(x.bulkMeta?.[`${k}_${year}`]||0)});return a}
  function snapshot(){return normalizeDb(db)}
  async function syncDrive(){if(syncing)return;syncing=true;status('Syncing with Google Drive…','busy');try{const file=await findDriveFile();if(file){const remote=await readDriveFile(file);mergeDriveDatabase(remote)}const payload={app:'RepForgeCloud',schema:SCHEMA,updatedAt:Date.now(),data:snapshot()};await writeDriveFile(file?.id,payload);finishSync()}catch(e){console.error(e);failSync(e);toast(e.message||'Google Drive sync failed')}finally{syncing=false}}
  async function connectDrive(){try{await getDriveToken();const r=await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user');const j=await r.json();const email=j.user?.emailAddress||'Google account';$('syncEmail').textContent=email;$('syncEmail2').textContent=email;$('signInBox').hidden=true;$('accountBox').hidden=false;$('syncProviderText').textContent='Google Drive';status('Connected','ok');await syncDrive()}catch(e){toast(e.message||'Google Drive connection failed')}}
  function initDrive(){if(!configuredDrive()){status('Google Drive not configured','off');return}if(window.google?.accounts?.oauth2){connectDrive()}}
  async function syncNow(){if(provider()==='firebase')return syncFirebase();if(provider()==='drive')return syncDrive()}
  function schedule(){if(provider()==='local')return;clearTimeout(timer);timer=setTimeout(()=>syncNow(),900)}
  function setup(){
    $('syncOpen').onclick=()=>openModal($('syncModal'));$('syncMoreBtn').onclick=()=>openModal($('syncModal'));
    $('providerSelect').onchange=e=>setProvider(e.target.value);
    $('saveFirebaseConfig').onclick=()=>{try{const c=JSON.parse($('firebaseConfigText').value);if(!c.apiKey||!c.projectId)return toast('Paste a valid Firebase web config');setProvider('firebase');localStorage.setItem(FB_KEY,JSON.stringify(c));location.reload()}catch{toast('Firebase config must be valid JSON')}};
    $('saveDriveConfig').onclick=()=>{const clientId=$('driveClientId').value.trim();if(!clientId)return toast('Enter your Google OAuth Web Client ID');localStorage.setItem(DRIVE_KEY,JSON.stringify({clientId}));setProvider('drive')};
    $('signUp').onclick=firebaseSignUp;$('signIn').onclick=firebaseSignIn;$('googleSignIn').onclick=googleSignIn;$('resetPassword').onclick=reset;$('signOut').onclick=()=>auth?.signOut();$('syncNow').onclick=syncNow;$('driveConnect').onclick=connectDrive;
    const p=provider();$('providerSelect').value=p;$('syncProviderText').textContent=p==='firebase'?'Firebase / Firestore':p==='drive'?'Google Drive':'Local only';
    const c=cfg();if(c)$('firebaseConfigText').value=JSON.stringify(c,null,2);const dc=driveCfg();if(dc)$('driveClientId').value=dc.clientId||'';
    $('firebaseSection').hidden=p!=='firebase';$('driveSection').hidden=p!=='drive';$('localSection').hidden=p!=='local';
    if(p==='firebase')initFirebase();else if(p==='drive')initDrive();else{showSignedOut();status('Local only','off')}
  }
  window.RepForgeSync={schedule,syncNow,setup,configured:()=>provider()!=='local',setProvider};
})();
