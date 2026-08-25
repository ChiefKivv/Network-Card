import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app-check.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, deleteObject } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import { firebaseConfig, APP_CHECK_SITE_KEY, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

if (APP_CHECK_SITE_KEY && !APP_CHECK_SITE_KEY.startsWith("PASTE_")) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginStatus = document.querySelector("#loginStatus");
const logoutButton = document.querySelector("#logout");

function esc(value="") {
  const s = String(value);
  return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function formatDate(value) {
  if (!value) return "Unknown date";
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? "Unknown date" : d.toLocaleString();
}

onAuthStateChanged(auth, async user => {
  const allowed = !!(user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  loginPanel.hidden = allowed;
  dashboard.hidden = !allowed;
  logoutButton.hidden = !allowed;

  if (user && !allowed) {
    loginStatus.textContent = "This account is not authorized for the admin dashboard.";
    await signOut(auth);
    return;
  }

  if (allowed) {
    loginStatus.textContent = "";
    await Promise.all([loadMixes(), loadBookings()]);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  loginStatus.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    console.error("Admin login failed", err);
    loginStatus.textContent = "Login failed. Check your email/password and Firebase Authentication setup.";
  }
});
logoutButton.onclick = () => signOut(auth);

document.querySelector("#mixForm").addEventListener("submit", async e => {
  e.preventDefault();
  const status = document.querySelector("#mixStatus");
  const submit = e.target.querySelector('button[type="submit"]');
  const file = document.querySelector("#mixFile").files[0];
  const name = document.querySelector("#mixName").value.trim();
  const latest = document.querySelector("#isLatest").checked;

  if (!name || name.length > 150) { status.textContent = "Mix name must be 1–150 characters."; return; }
  if (!file || (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3"))) { status.textContent = "Please select an MP3 file."; return; }
  if (file.size <= 0 || file.size > 250 * 1024 * 1024) { status.textContent = "MP3 must be larger than 0 bytes and no more than 250 MB."; return; }

  status.textContent = "Uploading…";
  submit.disabled = true;
  let storageRef = null;

  try {
    const safe = file.name.replace(/[^a-z0-9._-]/gi,"-");
    const path = `mixes/${crypto.randomUUID()}-${safe}`;
    storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, {contentType:"audio/mpeg"});

    const newDoc = await addDoc(collection(db,"mixes"), {
      name,
      storagePath:path,
      isLatest:latest,
      createdAt:new Date().toISOString()
    });

    if (latest) {
      const all = await getDocs(collection(db,"mixes"));
      await Promise.all(all.docs.filter(d => d.id !== newDoc.id && d.data().isLatest).map(d => updateDoc(d.ref,{isLatest:false})));
    }

    status.textContent = "Mix uploaded.";
    e.target.reset();
    await loadMixes();
  } catch (err) {
    console.error("Mix upload failed", err);
    // If storage succeeded but Firestore failed, try to remove the orphaned upload.
    if (storageRef) {
      try { await deleteObject(storageRef); } catch {}
    }
    status.textContent = "Upload failed. Check Authentication, App Check, Firestore, Storage, and security rules.";
  } finally {
    submit.disabled = false;
  }
});

async function loadMixes() {
  const el = document.querySelector("#adminMixes");
  el.innerHTML = "Loading…";
  try {
    const snap = await getDocs(query(collection(db,"mixes"),orderBy("createdAt","desc")));
    if (snap.empty) { el.innerHTML = `<div class="empty">No mixes yet.</div>`; return; }

    el.innerHTML = snap.docs.map(d => {
      const x=d.data();
      return `<div class="admin-row"><div><strong>${esc(x.name)}</strong><small>${x.isLatest?"LATEST • ":""}${esc(formatDate(x.createdAt))}</small></div><div><button class="small-btn latestBtn" data-id="${d.id}">MAKE LATEST</button> <button class="small-btn danger deleteMix" data-id="${d.id}" data-path="${esc(x.storagePath)}">DELETE</button></div></div>`;
    }).join("");

    document.querySelectorAll(".latestBtn").forEach(b=>b.onclick=async()=>{
      try {
        const all=await getDocs(collection(db,"mixes"));
        await Promise.all(all.docs.filter(d => d.data().isLatest !== (d.id===b.dataset.id)).map(d=>updateDoc(d.ref,{isLatest:d.id===b.dataset.id})));
        await loadMixes();
      } catch (err) {
        console.error("Set latest failed", err);
        alert("Could not change Latest Mix. Check Firebase access and try again.");
      }
    });

    document.querySelectorAll(".deleteMix").forEach(b=>b.onclick=async()=>{
      if(!confirm("Delete this mix? This removes the MP3 and its listing.")) return;
      try {
        try {
          await deleteObject(ref(storage,b.dataset.path));
        } catch (err) {
          if (err?.code !== "storage/object-not-found") throw err;
        }
        await deleteDoc(doc(db,"mixes",b.dataset.id));
        await loadMixes();
      } catch (err) {
        console.error("Delete mix failed", err);
        alert("Delete failed. Nothing else was changed after the failure point; check Firebase and try again.");
      }
    });
  } catch (err) {
    console.error("Admin mix load failed", err);
    el.innerHTML = `<div class="empty">Unable to load mixes. Check admin login, App Check, Firestore, and rules.</div>`;
  }
}

async function loadBookings() {
  const el = document.querySelector("#bookings");
  el.innerHTML = "Loading…";
  try {
    const snap = await getDocs(query(collection(db,"bookings"),orderBy("createdAt","desc")));
    if (snap.empty) { el.innerHTML = `<div class="empty">No booking requests yet.</div>`; return; }

    el.innerHTML = snap.docs.map(d => {
      const x=d.data();
      return `<article class="booking"><div class="booking-top"><strong>${esc(x.requesterName)}</strong><span>${esc(x.status||"NEW")}</span></div>
        <p><b>${esc(x.eventDate)}</b> • ${esc(x.requestedTime)} • ${esc(x.eventType)}</p>
        <p>Genre: ${esc(x.genre||"Open Format")} • Deposit: ${esc(x.depositMethod)}</p>
        <p>${esc(x.email)} • ${esc(x.phone)}</p>
        ${x.details?`<p>${esc(x.details)}</p>`:""}
        <div><button class="small-btn statusBtn" data-id="${d.id}" data-status="CONFIRMED">CONFIRM</button> <button class="small-btn statusBtn" data-id="${d.id}" data-status="DEPOSIT RECEIVED">DEPOSIT RECEIVED</button> <button class="small-btn statusBtn" data-id="${d.id}" data-status="COMPLETED">COMPLETED</button></div>
      </article>`;
    }).join("");

    document.querySelectorAll(".statusBtn").forEach(b=>b.onclick=async()=>{
      try {
        await updateDoc(doc(db,"bookings",b.dataset.id),{status:b.dataset.status});
        await loadBookings();
      } catch (err) {
        console.error("Booking status update failed", err);
        alert("Could not update this booking. Check Firebase access and try again.");
      }
    });
  } catch (err) {
    console.error("Booking load failed", err);
    el.innerHTML = `<div class="empty">Unable to load bookings. Check admin login, App Check, Firestore, and rules.</div>`;
  }
}
