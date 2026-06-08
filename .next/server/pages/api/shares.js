"use strict";(()=>{var e={};e.id=227,e.ids=[227],e.modules={5890:e=>{e.exports=require("better-sqlite3")},145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,r)=>{Object.defineProperty(r,"l",{enumerable:!0,get:function(){return function e(r,t){return t in r?r[t]:"then"in r&&"function"==typeof r.then?r.then(r=>e(r,t)):"function"==typeof r&&"default"===t?r:void 0}}})},2032:(e,r,t)=>{t.r(r),t.d(r,{config:()=>T,default:()=>f,routeModule:()=>m});var a={};t.r(a),t.d(a,{default:()=>c});var s=t(6794),n=t(6114),i=t(6249),o=t(5890),u=t.n(o);let l=require("fs"),d=require("child_process");var E=t(5613);async function c(e,r){let t=await (0,E.G)(e);if(!t)return r.status(401).end();let a=new(u())("/app/data/filemanager.db");try{if("GET"===e.method){let e=a.prepare("SELECT * FROM shares WHERE user_id = ?").all(t.userId);r.json(e)}if("POST"===e.method){let{name:s,path:n,readOnly:i}=e.body;if(!s||!n)return r.status(400).json({error:"Missing fields"});if(!n.startsWith("/app/drives"))return r.status(400).json({error:"Invalid path"});a.exec(`
        CREATE TABLE IF NOT EXISTS shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          read_only INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
      `);let o=a.prepare("INSERT INTO shares (user_id, name, path, read_only) VALUES (?, ?, ?, ?)").run(t.userId,s,n,i?1:0);p(a),r.json({ok:!0,id:o.lastInsertRowid,uncPath:`\\\\filemanager\\${s}`})}if("DELETE"===e.method){let{id:s}=e.body;a.prepare("DELETE FROM shares WHERE id = ? AND user_id = ?").run(s,t.userId),p(a),r.json({ok:!0})}}catch(e){r.status(500).json({error:e.message})}}function p(e){try{let r=e.prepare("SELECT * FROM shares").all(),t=`
[global]
  workgroup = WORKGROUP
  server string = FileManager
  security = user
  map to guest = bad user
  log file = /var/log/samba/log.%m
  max log size = 50

`;r.forEach(e=>{t+=`
[${e.name}]
  path = ${e.path}
  browsable = yes
  writable = ${e.read_only?"no":"yes"}
  guest ok = no
  valid users = smbuser
  create mask = 0755
  directory mask = 0755

`}),(0,l.writeFileSync)("/etc/samba/smb.conf",t);try{(0,d.execSync)("smbcontrol smbd reload-config")}catch{(0,d.execSync)("pkill -9 smbd; smbd -D")}}catch(e){console.error("Samba reload failed:",e)}}let f=(0,i.l)(a,"default"),T=(0,i.l)(a,"config"),m=new s.PagesAPIRouteModule({definition:{kind:n.x.PAGES_API,page:"/api/shares",pathname:"/api/shares",bundlePath:"",filename:""},userland:a})},5613:(e,r,t)=>{t.d(r,{G:()=>n});var a=t(5890),s=t.n(a);async function n(e){try{let r=e.headers.cookie;if(!r)return null;let t=r.match(/session=([^;]+)/);if(!t)return null;let a=t[1],n=new(s())("/app/data/filemanager.db"),i=n.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(a);if(!i)return null;if(new Date(i.expires_at)<new Date)return n.prepare("DELETE FROM sessions WHERE id = ?").run(a),null;return{userId:i.user_id}}catch(e){return null}}},6114:(e,r)=>{var t;Object.defineProperty(r,"x",{enumerable:!0,get:function(){return t}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE",e.IMAGE="IMAGE"}(t||(t={}))},6794:(e,r,t)=>{e.exports=t(145)}};var r=require("../../webpack-api-runtime.js");r.C(e);var t=r(r.s=2032);module.exports=t})();