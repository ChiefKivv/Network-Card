<!DOCTYPE html>
<html lang="en">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="theme-color"
    content="#0a0a0a"
  >


  <!-- CHIEF KIVV BROWSER ICON -->

  <link
    rel="icon"
    type="image/png"
    href="./assets/favicon.png"
  >

  <link
    rel="apple-touch-icon"
    href="./assets/favicon.png"
  >


  <title>Chief Kivv Admin</title>


  <link
    rel="stylesheet"
    href="styles.css"
  >

</head>


<body>


  <main class="admin site">


    <!-- ========================= -->
    <!-- ADMIN HEADER              -->
    <!-- ========================= -->

    <header class="admin-head">

      <div class="admin-brand">

        <img
          src="./assets/ChiefKivvWhite.png"
          alt="Chief Kivv"
          style="
            display:block;
            width:220px;
            max-width:70vw;
            height:auto;
            max-height:none;
            object-fit:contain;
            border-radius:0;
            margin:0 0 8px 0;
          "
          onerror="this.style.display='none'"
        >

        <p>
          Admin Dashboard
        </p>

      </div>


      <button
        id="logout"
        class="small-btn"
        type="button"
        hidden
      >
        LOG OUT
      </button>

    </header>


    <!-- ========================= -->
    <!-- ADMIN LOGIN               -->
    <!-- ========================= -->

    <section
      id="loginPanel"
      class="panel"
    >

      <h2>
        ADMIN LOGIN
      </h2>


      <form id="loginForm">


        <label>
          Email

          <input
            id="loginEmail"
            type="email"
            value="doublecupbookings@gmail.com"
            autocomplete="username"
            required
          >
        </label>


        <label>
          Password

          <input
            id="loginPassword"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>


        <button
          class="submit"
          type="submit"
        >
          SIGN IN
        </button>


        <p
          id="loginStatus"
          class="status"
        ></p>


      </form>

    </section>


    <!-- ================================== -->
    <!-- ADMIN DASHBOARD                    -->
    <!-- Hidden until authenticated         -->
    <!-- ================================== -->

    <div
      id="dashboard"
      hidden
    >


      <!-- ========================= -->
      <!-- ADD / UPLOAD MIX          -->
      <!-- ========================= -->

      <section class="panel">


        <h2>
          UPLOAD A MIX
        </h2>


        <form id="mixForm">


          <label>
            Mix Name*

            <input
              id="mixName"
              maxlength="150"
              placeholder="Summer Soca Session"
              required
            >
          </label>


          <!-- MIX SOURCE -->

          <label>
            Mix Source*

            <select id="mixSource">

              <option value="upload">
                Upload MP3 / AIF / AIFF
              </option>

              <option value="soundcloud">
                SoundCloud Link
              </option>

            </select>

          </label>


          <!-- DIRECT AUDIO UPLOAD -->

          <label id="mixFileLabel">

            Audio File*

            <input
              id="mixFile"
              type="file"
              accept="audio/mpeg,audio/aiff,audio/x-aiff,.mp3,.aif,.aiff"
            >

          </label>


          <!-- SOUNDCLOUD -->

          <label
            id="soundcloudUrlLabel"
            hidden
          >

            SoundCloud Track URL*

            <input
              id="soundcloudUrl"
              type="url"
              maxlength="1000"
              placeholder="https://soundcloud.com/artist/mix-name"
            >

          </label>


          <p class="muted">
            Direct uploads: MP3, AIF or AIFF up to 2 GB.
            Large files use resumable upload.
          </p>


          <!-- LATEST MIX -->

          <label class="check">

            <input
              id="isLatest"
              type="checkbox"
            >

            Set as Latest Mix

          </label>


          <button
            class="submit"
            type="submit"
          >
            ADD MIX
          </button>


          <p
            id="mixStatus"
            class="status"
          ></p>


        </form>

      </section>


      <!-- ========================= -->
      <!-- MIX LIBRARY               -->
      <!-- ========================= -->

      <section class="panel">

        <h2>
          MIX LIBRARY
        </h2>

        <div id="adminMixes">
          Loading…
        </div>

      </section>


      <!-- ========================= -->
      <!-- BOOKING REQUESTS          -->
      <!-- ========================= -->

      <section class="panel">

        <h2>
          BOOKING REQUESTS
        </h2>

        <div id="bookings">
          Loading…
        </div>

      </section>


    </div>

  </main>


  <!-- ========================= -->
  <!-- ADMIN JAVASCRIPT          -->
  <!-- ========================= -->

  <script
    type="module"
    src="admin.js"
  ></script>


</body>
</html>onAuthStateChanged(auth, async user => {
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

const mixSource = document.querySelector("#mixSource");
const mixFile = document.querySelector("#mixFile");
const mixFileLabel = document.querySelector("#mixFileLabel");
const soundcloudUrl = document.querySelector("#soundcloudUrl");
const soundcloudUrlLabel = document.querySelector("#soundcloudUrlLabel");

function syncMixSourceFields() {
  const useSoundCloud = mixSource.value === "soundcloud";
  mixFileLabel.hidden = useSoundCloud;
  soundcloudUrlLabel.hidden = !useSoundCloud;
  mixFile.required = !useSoundCloud;
  soundcloudUrl.required = useSoundCloud;
}

mixSource.addEventListener("change", syncMixSourceFields);
syncMixSourceFields();

function isValidSoundCloudUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "soundcloud.com" || url.hostname.endsWith(".soundcloud.com"));
  } catch {
    return false;
  }
}

function uploadLargeAudio(storageRef, file, statusEl) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {contentType: file.type || (file.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/aiff")});
    task.on("state_changed", snapshot => {
      const pct = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
      statusEl.textContent = `Uploading… ${pct}%`;
    }, reject, () => resolve(task.snapshot));
  });
}

document.querySelector("#mixForm").addEventListener("submit", async e => {
  e.preventDefault();
  const status = document.querySelector("#mixStatus");
  const submit = e.target.querySelector('button[type="submit"]');
  const name = document.querySelector("#mixName").value.trim();
  const latest = document.querySelector("#isLatest").checked;
  const sourceType = mixSource.value;

  if (!name || name.length > 150) { status.textContent = "Mix name must be 1–150 characters."; return; }

  status.textContent = sourceType === "upload" ? "Preparing upload…" : "Saving SoundCloud mix…";
  submit.disabled = true;
  let storageRef = null;

  try {
    let mixData;

    if (sourceType === "upload") {
      const file = mixFile.files[0];
      const lower = file?.name?.toLowerCase() || "";
      const allowedExt = lower.endsWith(".mp3") || lower.endsWith(".aif") || lower.endsWith(".aiff");
      const allowedType = ["audio/mpeg", "audio/aiff", "audio/x-aiff", "audio/x-aif"].includes(file?.type || "");
      if (!file || (!allowedExt && !allowedType)) { status.textContent = "Please select an MP3, AIF, or AIFF file."; return; }
      if (file.size <= 0 || file.size > 2 * 1024 * 1024 * 1024) { status.textContent = "Audio file must be larger than 0 bytes and no more than 2 GB."; return; }

      const safe = file.name.replace(/[^a-z0-9._-]/gi,"-");
      const path = `mixes/${crypto.randomUUID()}-${safe}`;
      storageRef = ref(storage, path);
      await uploadLargeAudio(storageRef, file, status);
      mixData = {
        name,
        sourceType: "upload",
        storagePath: path,
        isLatest: latest,
        createdAt: new Date().toISOString()
      };
    } else {
      const url = soundcloudUrl.value.trim();
      if (!isValidSoundCloudUrl(url)) { status.textContent = "Enter a valid https://soundcloud.com/... track URL."; return; }
      mixData = {
        name,
        sourceType: "soundcloud",
        soundcloudUrl: url,
        isLatest: latest,
        createdAt: new Date().toISOString()
      };
    }

    const newDoc = await addDoc(collection(db,"mixes"), mixData);

    if (latest) {
      const all = await getDocs(collection(db,"mixes"));
      await Promise.all(all.docs.filter(d => d.id !== newDoc.id && d.data().isLatest).map(d => updateDoc(d.ref,{isLatest:false})));
    }

    status.textContent = sourceType === "upload" ? "Mix uploaded." : "SoundCloud mix added.";
    e.target.reset();
    syncMixSourceFields();
    await loadMixes();
  } catch (err) {
    console.error("Mix add failed", err);
    if (storageRef) {
      try { await deleteObject(storageRef); } catch {}
    }
    status.textContent = "Could not add mix. Check Authentication, Firestore, Storage, App Check, and security rules.";
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
      const source = x.sourceType === "soundcloud" ? "SOUNDCLOUD" : "UPLOAD";
      return `<div class="admin-row"><div><strong>${esc(x.name)}</strong><small>${x.isLatest?"LATEST • ":""}${source} • ${esc(formatDate(x.createdAt))}</small></div><div><button class="small-btn latestBtn" data-id="${d.id}">MAKE LATEST</button> <button class="small-btn danger deleteMix" data-id="${d.id}" data-path="${esc(x.storagePath||"")}" data-source="${esc(x.sourceType||"upload")}">DELETE</button></div></div>`;
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
        if (b.dataset.source !== "soundcloud" && b.dataset.path) {
          try {
            await deleteObject(ref(storage,b.dataset.path));
          } catch (err) {
            if (err?.code !== "storage/object-not-found") throw err;
          }
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
