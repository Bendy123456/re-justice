'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const nodes={};
const fakeElement=()=>({style:{},children:[],append(v){this.children.push(v);},appendChild(v){this.children.push(v);},textContent:'',className:''});
const document={
  getElementById(id){return nodes[id]??(nodes[id]=fakeElement());},
  createElement(){return fakeElement();},
  addEventListener(){}
};
const storage={values:{},getItem(key){return this.values[key]??null;},setItem(key,value){this.values[key]=String(value);}};
const window={FG:{},document,navigator:{getGamepads:()=>[]},localStorage:storage,addEventListener(){},removeEventListener(){},devicePixelRatio:1};
const sandbox={window,document,localStorage:storage,navigator:window.navigator,structuredClone,console,Math,Date,JSON,setTimeout,clearTimeout};
vm.createContext(sandbox);
const files=['assets.js','characters.js','stages.js','audio.js','input.js','ai.js','engine.js','ui.js','tests.js'];
for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
const result=window.__testResult;
if(!result)throw new Error('Browser test harness did not publish a result');
console.log(result.passed+'/'+result.total+' RE-Justice tests passed');
if(result.passed!==result.total){
  for(const node of nodes.cases.children.filter(n=>n.className==='fail'))console.error('FAIL: '+node.textContent);
  process.exitCode=1;
}
