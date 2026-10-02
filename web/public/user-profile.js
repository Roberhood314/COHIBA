(()=>{"use strict";
const $=s=>document.querySelector(s);
let onboardingId=sessionStorage.getItem("cohiba_onboarding_id")||"";
let onboardingToken=sessionStorage.getItem("cohiba_onboarding_token")||"";
let verifiedPhone=sessionStorage.getItem("cohiba_verified_phone")||"";
let authToken=localStorage.getItem("cohiba_human_signal_token")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function setStep(n){
 ["stepPhone","stepOtp","stepProfile"].forEach((id,i)=>$("#"+id).classList.toggle("hidden",i!==n-1));
 [1,2,3].forEach(i=>{const b=$("#stepBadge"+i);b.classList.toggle("active",i===n);b.classList.toggle("done",i<n)});
}
async function post(path,payload,timeout=12000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try{
   const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal:c.signal});
   const x=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(x.error||("HTTP_"+r.status));
   return x;
 }finally{clearTimeout(t)}
}
async function authPost(path,payload,timeout=12000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try{
   const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+authToken},body:JSON.stringify(payload),cache:"no-store",signal:c.signal});
   const x=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(x.error||("HTTP_"+r.status));
   return x;
 }finally{clearTimeout(t)}
}
function showMode(mode){
 const login=mode==="login";
 $("#loginCard").classList.toggle("hidden",!login);
 $("#registerFlow").classList.toggle("hidden",login);
 $("#tabLogin").classList.toggle("active",login);
 $("#tabRegister").classList.toggle("active",!login);
 $("#accountTabs").classList.remove("hidden");
}

function resetOnboarding(message="Phiên xác minh đã hết hạn. Vui lòng xác minh số điện thoại lại."){
  onboardingId="";onboardingToken="";verifiedPhone="";
  sessionStorage.removeItem("cohiba_onboarding_id");
  sessionStorage.removeItem("cohiba_onboarding_token");
  sessionStorage.removeItem("cohiba_verified_phone");
  $("#otp").value="";
  setStep(1);
  $("#phoneState").innerHTML='<span class="bad">'+esc(message)+'</span>';
}
function friendly(err){
 const m=String(err?.message||err);
 const map={
  INVALID_E164_PHONE:"Số điện thoại chưa đúng. Hãy nhập 0901234567 hoặc +84901234567.",
  PHONE_CONSENT_REQUIRED:"Bạn cần đồng ý nhận SMS OTP.",
  OTP_RATE_LIMITED:"Bạn đã yêu cầu OTP quá nhiều lần. Hãy thử lại sau ít phút.",
  PHONE_VERIFY_SEND_FAILED:"Nhà cung cấp SMS chưa gửi được OTP. Hãy thử lại sau ít phút.",
  OTP_PROVIDER_DAILY_LIMIT:"Số điện thoại này đã đạt giới hạn OTP trong ngày. Hãy thử lại sau khi giới hạn được làm mới.",
  PHONE_CODE_INVALID:"Mã OTP không đúng hoặc đã hết hạn.",
  ONBOARDING_EXPIRED:"Phiên xác minh đã hết hạn. Hãy gửi OTP lại.",
  ONBOARDING_TOKEN_INVALID:"Phiên tạo tài khoản không còn hiệu lực. Hệ thống sẽ đưa bạn về xác minh số điện thoại để đăng nhập lại.",
  DISPLAY_NAME_TAKEN:"Tên tài khoản này đã được dùng.",
  DISPLAY_NAME_LENGTH:"Tên tài khoản cần từ 3 đến 32 ký tự.",
  DISPLAY_NAME_INVALID:"Tên tài khoản chứa ký tự không hợp lệ.",
  PASSWORD_LENGTH:"Mật khẩu phải có từ 8 đến 128 ký tự.",
  PASSWORD_COMPLEXITY:"Mật khẩu phải có ít nhất một chữ và một số.",
  PHONE_OR_PASSWORD_INVALID:"Số điện thoại hoặc mật khẩu không đúng.",
  LOGIN_RATE_LIMITED:"Đăng nhập sai quá nhiều lần. Hãy thử lại sau 15 phút."
 };
 return map[m]||m;
}
async function loadAccount(){
 if(!authToken)return false;
 try{
  const r=await fetch("/api/human-signal/dashboard",{headers:{authorization:"Bearer "+authToken},cache:"no-store"});
  const x=await r.json();
  if(!r.ok)throw new Error(x.error||"AUTH_FAILED");
  $("#stepPhone").classList.add("hidden");$("#stepOtp").classList.add("hidden");$("#stepProfile").classList.add("hidden");
  $("#loginCard").classList.add("hidden");$("#registerFlow").classList.add("hidden");$("#accountTabs").classList.add("hidden");
  $("#accountReady").classList.remove("hidden");
  [1,2,3].forEach(i=>{$("#stepBadge"+i).classList.remove("active");$("#stepBadge"+i).classList.add("done")});
  $("#accountName").textContent=x.profile?.displayName||x.profile?.id||"—";
  $("#profileId").textContent=x.profile?.id||"—";
  $("#pendingCoh").textContent=Number(x.mining?.pendingCoh||0).toLocaleString(undefined,{maximumFractionDigits:8});
  $("#miningStatus").textContent=x.mining?.activeSession?"ACTIVE":"IDLE";
  return true;
 }catch{
  localStorage.removeItem("cohiba_human_signal_token");authToken="";return false;
 }
}
$("#sendOtp").addEventListener("click",async()=>{
 onboardingToken="";
 sessionStorage.removeItem("cohiba_onboarding_token");
 const phone=$("#phone").value.trim(),consent=$("#consent").checked;
 $("#sendOtp").disabled=true;$("#phoneState").textContent="Đang gửi OTP…";
 try{
  const x=await post("/api/account/onboarding/phone/start",{phone,consent});
  onboardingId=x.onboardingId;verifiedPhone=phone;
  sessionStorage.setItem("cohiba_onboarding_id",onboardingId);
  sessionStorage.setItem("cohiba_verified_phone",verifiedPhone);
  $("#otpState").textContent="OTP đã gửi. Kiểm tra SMS và nhập mã.";
  setStep(2);
 }catch(err){$("#phoneState").innerHTML='<span class="bad">'+esc(friendly(err))+'</span>'}
 finally{$("#sendOtp").disabled=false}
});
$("#verifyOtp").addEventListener("click",async()=>{
 const code=$("#otp").value.trim();
 $("#verifyOtp").disabled=true;$("#otpState").textContent="Đang xác minh…";
 try{
  const x=await post("/api/account/onboarding/phone/check",{phone:verifiedPhone,code,onboardingId});
  onboardingToken=x.onboardingToken;
  sessionStorage.setItem("cohiba_onboarding_token",onboardingToken);
  $("#profileState").innerHTML='<span class="ok">Số điện thoại đã xác minh ✓</span>';
  setStep(3);
 }catch(err){
   const code=String(err?.message||err);
   if(code==="ONBOARDING_EXPIRED" || code==="ONBOARDING_TOKEN_INVALID"){
     resetOnboarding("Phiên OTP đã hết hạn. Hãy gửi mã OTP mới.");
   }else{
     $("#otpState").innerHTML='<span class="bad">'+esc(friendly(err))+'</span>';
   }
 }
 finally{$("#verifyOtp").disabled=false}
});
$("#backPhone").addEventListener("click",()=>{
 onboardingId="";onboardingToken="";verifiedPhone="";
 sessionStorage.removeItem("cohiba_onboarding_id");sessionStorage.removeItem("cohiba_onboarding_token");sessionStorage.removeItem("cohiba_verified_phone");
 setStep(1);
});
$("#createAccount").addEventListener("click",async()=>{
 const displayName=$("#displayName").value.trim();
 const password=$("#newPassword").value,confirm=$("#confirmPassword").value;
 $("#createAccount").disabled=true;$("#profileState").textContent="Đang lưu hồ sơ và mật khẩu…";
 try{
  if(password!==confirm)throw new Error("Mật khẩu nhập lại chưa khớp.");
  const x=await post("/api/account/onboarding/profile",{displayName,password,onboardingToken});
  authToken=x.token;localStorage.setItem("cohiba_human_signal_token",authToken);
  sessionStorage.removeItem("cohiba_onboarding_id");sessionStorage.removeItem("cohiba_onboarding_token");sessionStorage.removeItem("cohiba_verified_phone");
  await loadAccount();
 }catch(err){
   const code=String(err?.message||err);
   if(code==="ONBOARDING_TOKEN_INVALID" || code==="ONBOARDING_EXPIRED"){
     resetOnboarding("Phiên tạo tài khoản cũ đã hết hạn. Hệ thống đã đưa bạn về bước xác minh số điện thoại.");
   }else{
     $("#profileState").innerHTML='<span class="bad">'+esc(friendly(err))+'</span>';
   }
 }
 finally{$("#createAccount").disabled=false}
});
$("#tabLogin").addEventListener("click",()=>showMode("login"));
$("#tabRegister").addEventListener("click",()=>showMode("register"));
$("#forgotPassword").addEventListener("click",()=>{
 const phone=$("#loginPhone").value.trim();
 if(phone)$("#phone").value=phone;
 showMode("register");
 $("#phoneState").textContent="Xác minh OTP để tạo hoặc đặt lại mật khẩu cho tài khoản.";
});
$("#loginButton").addEventListener("click",async()=>{
 const phone=$("#loginPhone").value.trim(),password=$("#loginPassword").value;
 $("#loginButton").disabled=true;$("#loginState").textContent="Đang đăng nhập…";
 try{
   const x=await post("/api/account/login",{phone,password});
   authToken=x.token;localStorage.setItem("cohiba_human_signal_token",authToken);
   $("#loginPassword").value="";
   await loadAccount();
 }catch(err){
   $("#loginState").innerHTML='<span class="bad">'+esc(friendly(err))+'</span>';
 }finally{$("#loginButton").disabled=false}
});
$("#showPasswordChange").addEventListener("click",()=>$("#passwordChange").classList.toggle("hidden"));
$("#savePassword").addEventListener("click",async()=>{
 const a=$("#changePassword").value,b=$("#changePassword2").value;
 $("#savePassword").disabled=true;$("#passwordState").textContent="Đang cập nhật mật khẩu…";
 try{
   if(a!==b)throw new Error("Mật khẩu nhập lại chưa khớp.");
   const x=await authPost("/api/account/password",{password:a});
   if(x.token){authToken=x.token;localStorage.setItem("cohiba_human_signal_token",authToken);}
   $("#changePassword").value="";$("#changePassword2").value="";
   $("#passwordState").innerHTML='<span class="ok">Mật khẩu đã cập nhật ✓</span>';
 }catch(err){
   $("#passwordState").innerHTML='<span class="bad">'+esc(friendly(err))+'</span>';
 }finally{$("#savePassword").disabled=false}
});
$("#logout").addEventListener("click",async()=>{
 try{if(authToken)await authPost("/api/account/logout",{});}catch{}
 localStorage.removeItem("cohiba_human_signal_token");authToken="";location.reload();
});
(async()=>{
 if(await loadAccount())return;
 if(onboardingToken&&verifiedPhone){
   showMode("register");setStep(3);
   $("#profileState").innerHTML='<span class="ok">Số điện thoại đã xác minh ✓</span>';
 }else if(onboardingId&&verifiedPhone){
   showMode("register");setStep(2);
 }else{
   if(onboardingToken||onboardingId) resetOnboarding();
   else {setStep(1);showMode("login");}
 }
})();
})();