"use strict";(()=>{var e={};e.id=556,e.ids=[556],e.modules={5890:e=>{e.exports=require("better-sqlite3")},145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,r){return r in t?t[r]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,r)):"function"==typeof t&&"default"===r?t:void 0}}})},704:(e,t,r)=>{r.r(t),r.d(t,{config:()=>l,default:()=>d,routeModule:()=>p});var n={};r.r(n),r.d(n,{default:()=>s});var i=r(6794),a=r(6114),u=r(6249),o=r(5890),E=r.n(o);async function s(e,t){if("POST"!==e.method)return t.status(405).end();try{let{drives:r}=e.body,n=new(E())("/app/data/filemanager.db");n.exec(`
      CREATE TABLE IF NOT EXISTS drives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mount_path TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);let i=n.prepare("INSERT INTO drives (user_id, mount_path, label) VALUES (1, ?, ?)");for(let e of r){let t=e.split("/").pop()||"Drive";i.run(e,t)}t.json({ok:!0})}catch(e){t.status(500).json({error:e.message})}}let d=(0,u.l)(n,"default"),l=(0,u.l)(n,"config"),p=new i.PagesAPIRouteModule({definition:{kind:a.x.PAGES_API,page:"/api/setup/complete",pathname:"/api/setup/complete",bundlePath:"",filename:""},userland:n})},6114:(e,t)=>{var r;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return r}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE",e.IMAGE="IMAGE"}(r||(r={}))},6794:(e,t,r)=>{e.exports=r(145)}};var t=require("../../../webpack-api-runtime.js");t.C(e);var r=t(t.s=704);module.exports=r})();