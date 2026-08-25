import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app-check.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import { firebaseConfig, APP_CHECK_SITE_KEY } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// App Check is activated only after a real public reCAPTCHA v3 site key is added.
if (APP_CHECK_SITE_KEY && !APP_CHECK_SITE_KEY.startsWith("PASTE_")) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

const db = getFirestore(app);
const storage = getStorage(app);

const latestEl = document.querySelector("#latest");
const listEl = document.querySelector("#mixList");
const player = document.querySelector("#player");
const modal = document.querySelector("#bookingModal");
const form = document.querySelector("#bookingForm");
const status = document.querySelector("#bookingStatus");
const submitButton = form.querySelector('button[type="submit"]');
const bookingSuccess = document.querySelector("#bookingSuccess");
const eventDate = form.querySelector('input[name="eventDate"]');

eventDate.min = new Date().toISOString().slice(0, 10);

function escapeHTML(value="") {
  const s = String(value);
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function closeBookingModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function soundCloudPlayerUrl(url) {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
}

function playMix(mix) {
  if (mix.sourceType === "soundcloud" && mix.soundcloudUrl) {
    player.pause();
    player.removeAttribute("src");
    player.style.display = "none";
    let sc = document.querySelector("#soundcloudPlayer");
    if (!sc) {
      sc = document.createElement("iframe");
      sc.id = "soundcloudPlayer";
      sc.width = "100%";
      sc.height = "166";
      sc.allow = "autoplay";
      sc.frameBorder = "0";
      player.insertAdjacentElement("beforebegin", sc);
    }
    sc.src = soundCloudPlayerUrl(mix.soundcloudUrl);
    sc.hidden = false;
    sc.scrollIntoView({behavior:"smooth", block:"center"});
    return;
  }

  const sc = document.querySelector("#soundcloudPlayer");
  if (sc) { sc.hidden = true; sc.removeAttribute("src"); }
  player.style.display = "";
  player.src = mix.url;
  player.play().catch(()=>{});
  player.scrollIntoView({behavior:"smooth", block:"center"});
}

async function loadMixes() {
  try {
    const snap = await getDocs(query(collection(db, "mixes"), orderBy("createdAt", "desc"), limit(50)));
    const mixes = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const mix = {...data, id: docSnap.id};
      if (data.sourceType === "soundcloud" && data.soundcloudUrl) {
        mixes.push(mix);
        continue;
      }
      if (!data.storagePath) continue;
      try {
        mix.url = await getDownloadURL(ref(storage, data.storagePath));
        mix.sourceType = mix.sourceType || "upload";
        mixes.push(mix);
      } catch (err) {
        console.warn("Skipped unavailable mix", docSnap.id, err);
      }
    }

    const latest = mixes.find(m => m.isLatest) || mixes[0];
    latestEl.innerHTML = latest
      ? `<div class="latest-card"><span class="eyebrow">LATEST MIX</span><strong>${escapeHTML(latest.name)}</strong><button class="play-latest" data-id="${escapeHTML(latest.id)}">▶ PLAY</button></div>`
      : `<div class="empty">No mixes have been published yet.</div>`;

    listEl.innerHTML = mixes.length
      ? mixes.filter(m => !latest || m.id !== latest.id).map(m => `<button class="mix-row" data-id="${escapeHTML(m.id)}"><span>${escapeHTML(m.name)}</span><b>▶</b></button>`).join("")
      : `<div class="empty">Your mixes will appear here.</div>`;

    const byId = new Map(mixes.map(m => [m.id, m]));
    document.querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => {
      const mix = byId.get(btn.dataset.id);
      if (mix) playMix(mix);
    }));
  } catch (err) {
    console.error("Mix load failed", err);
    latestEl.innerHTML = "";
    listEl.innerHTML = `<div class="empty">Mix library is unavailable. Check Firebase configuration, App Check, Firestore, and Storage.</div>`;
  }
}

document.querySelector("#bookingOpen").onclick = () => {
  bookingSuccess.hidden = true;
  status.textContent = "";
  submitButton.hidden = false;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
};
document.querySelector("#bookingClose").onclick = closeBookingModal;
modal.addEventListener("click", e => { if (e.target === modal) closeBookingModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("show")) closeBookingModal(); });

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!form.reportValidity()) return;

  const fd = new FormData(form);
  // Honeypot: normal visitors never fill this field.
  if ((fd.get("website") || "").trim()) {
    status.textContent = "Unable to submit right now. Please call/text 347-771-7483.";
    return;
  }
  fd.delete("website");

  const data = Object.fromEntries(fd.entries());
  data.genre = (data.genre || "Open Format").trim();
  data.eventType = data.eventType.trim();
  data.requesterName = data.requesterName.trim();
  data.email = data.email.trim();
  data.phone = data.phone.trim();
  data.details = (data.details || "").trim();
  if (!data.details) delete data.details;
  data.createdAt = new Date().toISOString();
  data.status = "NEW";

  status.textContent = "Submitting…";
  submitButton.disabled = true;

  try {
    await addDoc(collection(db, "bookings"), data);
    form.reset();
    eventDate.min = new Date().toISOString().slice(0, 10);
    status.textContent = "";
    submitButton.hidden = true;
    bookingSuccess.hidden = false;
  } catch (err) {
    console.error("Booking submission failed", err);
    status.textContent = "Unable to submit right now. Please call/text 347-771-7483.";
  } finally {
    submitButton.disabled = false;
  }
});

loadMixes();
