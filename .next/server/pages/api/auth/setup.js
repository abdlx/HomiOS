"use strict";(()=>{var e={};e.id=278,e.ids=[278],e.modules={7096:e=>{e.exports=require("bcrypt")},5890:e=>{e.exports=require("better-sqlite3")},145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,r){return r in t?t[r]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,r)):"function"==typeof t&&"default"===r?t:void 0}}})},9078:(e,t,r)=>{r.r(t),r.d(t,{config:()=>I,default:()=>A,routeModule:()=>P});var i={};r.r(i),r.d(i,{default:()=>l});var s=r(6794),a=r(6114),n=r(6249),E=r(5890),u=r.n(E),o=r(7096),T=r.n(o),d=r(4770),p=r.n(d);async function l(e,t){if("POST"!==e.method)return t.status(405).end();try{let r=new(u())("/app/data/filemanager.db"),{email:i,password:s}=e.body;if(r.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS initialized (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `),r.prepare("SELECT 1 FROM initialized WHERE key = ?").get("setup_complete"))return t.status(400).json({error:"Already initialized"});let a=await T().hash(s,10),n=r.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(i,a);r.prepare("INSERT INTO initialized (key, value) VALUES (?, ?)").run("setup_complete","1");let E=p().randomBytes(32).toString("hex"),o=new Date(Date.now()+2592e6).toISOString();r.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(E,n.lastInsertRowid,o),t.setHeader("Set-Cookie",`session=${E}; Path=/; HttpOnly; Max-Age=2592000`),t.json({ok:!0,userId:n.lastInsertRowid})}catch(e){t.status(500).json({error:e.message})}}let A=(0,n.l)(i,"default"),I=(0,n.l)(i,"config"),P=new s.PagesAPIRouteModule({definition:{kind:a.x.PAGES_API,page:"/api/auth/setup",pathname:"/api/auth/setup",bundlePath:"",filename:""},userland:i})},6114:(e,t)=>{var r;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return r}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE",e.IMAGE="IMAGE"}(r||(r={}))},6794:(e,t,r)=>{e.exports=r(145)}};var t=require("../../../webpack-api-runtime.js");t.C(e);var r=t(t.s=9078);module.exports=r})();