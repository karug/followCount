
function updateClock(){
 const d=new Date();
 document.getElementById("clock").textContent=
 d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
updateClock();
setInterval(updateClock,1000);

function animateCounter(v){
 const s=v.toString().padStart(7,"0");
 document.querySelectorAll(".digit").forEach((e,i)=>{
   e.style.transform="rotateX(90deg)";
   setTimeout(()=>{
      e.textContent=s[i];
      e.style.transform="rotateX(0deg)";
   },120+i*20);
 });
}
setInterval(()=>animateCounter(Math.floor(Math.random()*9000000)),5000);
