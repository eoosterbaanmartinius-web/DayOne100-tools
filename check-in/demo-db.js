// DayOne100 Tools · Check-in DEMO database
// Stands in for Supabase. Everything lives in this browser's localStorage and follows the same rules
// as the real database: the QR changes every 15 seconds, an old QR is refused, a scan gives a ticket
// that lasts 10 minutes, and only students of the session's class can check in.
// Test data only. No real students, nothing leaves this browser.
(function(){
const KEY='d100-checkin-demo', WIN=15;
// Invented students, one list per group. None of these are real people.
const GROUPS={
  'TECH3':['Anna de Vries','Bram Jansen','Chloe Bakker','Daan Smit','Emma Visser','Finn Mulder','Lina Haddad','Ravi Kumar'],
  'TECH1-T1':['Sara El Amrani','Tom Hendriks','Mila Peters','Noah Dekker','Yara Bos','Jesse Vos','Priya Nair'],
  'TECH1-T2':['Lucas Meijer','Nora Kok','Sem van Dijk','Zoë Willems','Omar Benali','Julia de Groot'],
  'DIGSKILLS':['Eva Brouwer','Max de Wit','Iris Hoekstra','Adam Yilmaz','Fleur Koster']
};
const CLASS_NAMES={'TECH3':'Tech 3 · Year 2','TECH1-T1':'Tech 1 · Team 1','TECH1-T2':'Tech 1 · Team 2','DIGSKILLS':'Digital Skills & AI'};
const mail=n=>n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(' ')[0]+'@demo.nl';
// A fixed shuffle, so the Compass list is not alphabetical, like the real one.
function shuffled(a,seed){const b=a.slice();let x=seed;for(let i=b.length-1;i>0;i--){x=(x*9301+49297)%233280;const j=Math.floor(x/233280*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function seed(){
  const profiles=[{id:'t',name:'Erik',email:'teacher@demo.nl',role:'teacher',class_code:null}];
  const rosters=[];let n=0,k=7;
  for(const [code,names] of Object.entries(GROUPS)){
    names.forEach(name=>{n++;profiles.push({id:'s'+n,name,email:mail(name),role:'student',class_code:code})});
    // The Compass list has one student who never made an account, to show how that looks.
    rosters.push({class_code:code,names:shuffled(names,k++).concat(code==='TECH3'?['Kai Okafor']:[]),updated_at:'2026-11-01T08:00:00Z'});
  }
  return{
    classes:Object.keys(GROUPS).map((code,i)=>({code,name:CLASS_NAMES[code],active:true,created_at:'2026-09-0'+(i+1)})),
    profiles,rosters,attendance_sessions:[],attendance:[],n:0
  };
}
function load(){try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&d.profiles)return d}catch(e){}const d=seed();save(d);return d}
function save(d){try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){}}
window.DEMO_RESET=function(){try{localStorage.removeItem(KEY);localStorage.removeItem('d100-demo-student');localStorage.removeItem('d100-demo-qr');localStorage.removeItem('d100-demo-today')}catch(e){}};

// The teacher page is always logged in as the teacher; the phone keeps its own login.
const ROLE=window.DEMO_ROLE||'student';
function uid(){if(ROLE==='teacher')return 't';try{return localStorage.getItem('d100-demo-student')}catch(e){return null}}

function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
const win=()=>Math.floor(Date.now()/1000/WIN);
const token=(s,w)=>hash(s.secret+':qr:'+w).slice(0,8);
const ticket=(s,w)=>hash(s.secret+':ticket:'+w)+hash(w+':'+s.secret);
const isOpen=s=>!s.closed_at&&(Date.now()-new Date(s.opened_at).getTime())<3*3600*1000;
const fail=m=>({data:null,error:{message:m}});
const ok=data=>({data,error:null});

function query(table){
  const filters=[];let op='select',payload=null,single=false,maybe=false,head=false,ord=null,lim=null;
  const api={
    select(cols,o){if(o&&o.head)head=true;return api},
    eq(k,v){filters.push(r=>r[k]===v);return api},
    is(k,v){filters.push(r=>(r[k]??null)===v);return api},
    order(k,o){ord=[k,!!(o&&o.ascending===false)];return api},
    limit(n){lim=n;return api},
    single(){single=true;return api},maybeSingle(){maybe=true;return api},
    insert(p){op='insert';payload=p;return api},
    update(p){op='update';payload=p;return api},
    delete(){op='delete';return api},
    then(res,rej){return Promise.resolve().then(run).then(res,rej)}
  };
  function run(){
    const d=load(),me=uid(),meP=d.profiles.find(p=>p.id===me),teacher=meP&&meP.role==='teacher';
    let rows=d[table];if(!rows)return fail('unknown table');
    // The same visibility rules as the real database.
    const visible=r=>{
      if(teacher)return true;
      if(table==='profiles')return r.id===me;
      if(table==='attendance')return r.user_id===me;
      if(table==='rosters')return false;
      return false;
    };
    if(op==='insert'){
      if(!teacher)return fail('new row violates row-level security policy');
      const r={...payload};
      if(table==='attendance_sessions'){d.n++;r.id='demo-'+Date.now().toString(36)+d.n;r.secret=hash(Math.random()+':'+Date.now())+hash(String(Math.random()));r.opened_at=new Date().toISOString();r.closed_at=null}
      if(table==='attendance'){r.user_id=r.user_id??null;r.roster_name=r.roster_name??null;if(rows.some(x=>x.session_id===r.session_id&&(r.user_id?x.user_id===r.user_id:x.roster_name===r.roster_name)))return fail('duplicate key');r.checked_at=new Date().toISOString();r.device=''}
      rows.push(r);save(d);return ok(single?r:[r]);
    }
    const match=rows.filter(r=>visible(r)&&filters.every(f=>f(r)));
    if(op==='update'){if(!teacher)return fail('not allowed');match.forEach(r=>Object.assign(r,payload));save(d);return ok(match)}
    if(op==='delete'){if(!teacher)return fail('not allowed');d[table]=rows.filter(r=>!match.includes(r));save(d);return ok(null)}
    let out=match.map(r=>{const c={...r};delete c.secret;return c});
    if(ord)out.sort((a,b)=>((a[ord[0]]??'')>(b[ord[0]]??'')?1:-1)*(ord[1]?-1:1));
    if(lim)out=out.slice(0,lim);
    if(head)return {count:out.length,data:null,error:null};
    if(single)return out[0]?ok(out[0]):fail('not found');
    if(maybe)return ok(out[0]||null);
    return ok(out);
  }
  return api;
}

async function rpc(fn,a){
  const d=load(),me=uid(),meP=d.profiles.find(p=>p.id===me);
  const s=d.attendance_sessions.find(x=>x.id===a.sid);
  if(fn==='checkin_current_token'){
    if(!meP||meP.role!=='teacher')return fail('NOT_ALLOWED');
    if(!s||!isOpen(s))return fail('SESSION_CLOSED');
    const w=win(),left=Math.max(1,Math.ceil((w+1)*WIN-Date.now()/1000));
    // For the demo controls: remember the QR address now on screen and one from 45 seconds ago.
    const base=location.origin+location.pathname.replace(/teacher\.html$/,'student.html');
    try{localStorage.setItem('d100-demo-qr',JSON.stringify({now:`${base}?s=${s.id}&t=${token(s,w)}`,old:`${base}?s=${s.id}&t=${token(s,w-3)}`,label:s.label,group:s.class_code}))}catch(e){}
    return ok([{token:token(s,w),seconds_left:left}]);
  }
  if(fn==='checkin_scan'){
    if(!s||!isOpen(s))return fail('SESSION_CLOSED');
    const now=win();
    for(let i=0;i<=1;i++)if(token(s,now-i)===String(a.tok||'').toLowerCase())return ok([{w:now-i,ticket:ticket(s,now-i),label:s.label}]);
    return fail('QR_EXPIRED');
  }
  if(fn==='check_in'){
    if(!me)return fail('NOT_LOGGED_IN');
    if(!s||!isOpen(s))return fail('SESSION_CLOSED');
    const now=win();
    if(a.w==null||a.w>now||a.w<now-40||a.ticket!==ticket(s,a.w))return fail('QR_EXPIRED');
    if(!meP)return fail('NO_PROFILE');
    if(meP.role!=='teacher'&&meP.class_code!==s.class_code)return fail('WRONG_CLASS');
    let r=d.attendance.find(x=>x.session_id===s.id&&x.user_id===me);
    if(!r){r={session_id:s.id,user_id:me,checked_at:new Date().toISOString(),method:'qr',device:''};d.attendance.push(r);save(d)}
    return ok(r.checked_at);
  }
  return fail('unknown function');
}

const auth={
  async getSession(){const id=uid();const p=id&&load().profiles.find(x=>x.id===id);return {data:{session:p?{user:{id:p.id,email:p.email}}:null}}},
  async signInWithPassword({email}){
    const p=load().profiles.find(x=>x.email===String(email).trim().toLowerCase()&&x.role==='student');
    if(!p)return {error:{message:'Invalid login credentials'}};
    try{localStorage.setItem('d100-demo-student',p.id)}catch(e){}
    return {error:null};
  },
  async signUp({email,options}){
    const d=load(),meta=(options&&options.data)||{};const em=String(email).trim().toLowerCase();
    if(d.profiles.some(x=>x.email===em))return {error:{message:'User already registered'}};
    const c=d.classes.find(x=>x.code===String(meta.class_code||'').toUpperCase()&&x.active);
    if(!c)return {error:{message:'Database error saving new user'}};
    d.n++;const id='u'+d.n+Date.now().toString(36);
    d.profiles.push({id,name:String(meta.name||'').slice(0,80),email:em,role:'student',class_code:c.code});save(d);
    try{localStorage.setItem('d100-demo-student',id)}catch(e){}
    return {data:{session:{user:{id,email:em}}},error:null};
  },
  async signOut(){if(ROLE!=='teacher')try{localStorage.removeItem('d100-demo-student')}catch(e){}}
};

window.DEMO_TODAY=(()=>{try{return localStorage.getItem('d100-demo-today')||''}catch(e){return ''}})();
window.supabase={createClient(){return {from:query,rpc,auth}}};
window.IDEACHECK_CONFIG={supabaseUrl:'demo',supabaseAnonKey:'demo'};
})();
