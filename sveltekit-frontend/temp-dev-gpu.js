const {spawn}=require("child_process");
const child=spawn("cmd.exe", ["/d","/s","/c","npm.cmd","run","dev:gpu"], { cwd: process.cwd(), stdio:["ignore","pipe","pipe"], windowsHide:true });
child.stdout.on("data", d=>process.stdout.write("[STDOUT] "+d));
child.stderr.on("data", d=>process.stderr.write("[STDERR] "+d));
child.on("error", e=>{ console.error("CHILD ERROR", e); process.exit(1); });
child.on("exit", (code, sig)=>{ console.log("CHILD EXIT", code, sig); process.exit(code||0); });
setTimeout(()=>{ console.log("TIMEOUT KILLING"); child.kill(); }, 15000);
