import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app-check.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

import {
  firebaseConfig,
  APP_CHECK_SITE_KEY,
  ADMIN_EMAIL
} from "./firebase-config.js";


/* =====================================================
   FIREBASE INITIALIZATION
===================================================== */

const app = initializeApp(firebaseConfig);

if (
  APP_CHECK_SITE_KEY &&
  !APP_CHECK_SITE_KEY.startsWith("PASTE_")
) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);


/* =====================================================
   PAGE ELEMENTS
===================================================== */

const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginStatus = document.querySelector("#loginStatus");
const logoutButton = document.querySelector("#logout");

const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");

const mixForm = document.querySelector("#mixForm");
const mixStatus = document.querySelector("#mixStatus");

const mixSource = document.querySelector("#mixSource");
const mixFile = document.querySelector("#mixFile");
const mixFileLabel = document.querySelector("#mixFileLabel");

const soundcloudUrl = document.querySelector("#soundcloudUrl");
const soundcloudUrlLabel = document.querySelector("#soundcloudUrlLabel");


/* =====================================================
   HELPER FUNCTIONS
===================================================== */

function esc(value = "") {
  const s = String(value);

  return s.replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
  );
}


function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const d = value?.toDate
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(d.getTime())
    ? "Unknown date"
    : d.toLocaleString();
}


/* =====================================================
   ADMIN AUTHENTICATION
===================================================== */

onAuthStateChanged(auth, async user => {

  const allowed = !!(
    user &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  loginPanel.hidden = allowed;
  dashboard.hidden = !allowed;
  logoutButton.hidden = !allowed;


  if (user && !allowed) {

    loginStatus.textContent =
      "This account is not authorized for the admin dashboard.";

    await signOut(auth);

    return;
  }


  if (allowed) {

    loginStatus.textContent = "";

    await Promise.all([
      loadMixes(),
      loadBookings()
    ]);
  }

});


/* =====================================================
   LOGIN
===================================================== */

document
  .querySelector("#loginForm")
  .addEventListener("submit", async e => {

    e.preventDefault();

    loginStatus.textContent = "Signing in…";

    try {

      await signInWithEmailAndPassword(
        auth,
        loginEmail.value.trim(),
        loginPassword.value
      );

    } catch (err) {

      console.error(
        "Admin login failed",
        err
      );

      loginStatus.textContent =
        `${err?.code || "LOGIN ERROR"}: ${err?.message || "Login failed."}`;
    }

  });


/* =====================================================
   LOGOUT
===================================================== */

logoutButton.addEventListener(
  "click",
  async () => {
    await signOut(auth);
  }
);


/* =====================================================
   SWITCH BETWEEN UPLOAD / SOUNDCLOUD
===================================================== */

function syncMixSourceFields() {

  const useSoundCloud =
    mixSource.value === "soundcloud";

  mixFileLabel.hidden =
    useSoundCloud;

  soundcloudUrlLabel.hidden =
    !useSoundCloud;

  mixFile.required =
    !useSoundCloud;

  soundcloudUrl.required =
    useSoundCloud;


  if (useSoundCloud) {
    mixFile.value = "";
  } else {
    soundcloudUrl.value = "";
  }
}


mixSource.addEventListener(
  "change",
  syncMixSourceFields
);

syncMixSourceFields();


/* =====================================================
   VALIDATE SOUNDCLOUD URL
===================================================== */

function isValidSoundCloudUrl(value) {

  try {

    const url = new URL(value);

    if (url.protocol !== "https:") {
      return false;
    }

    const host =
      url.hostname.toLowerCase();

    return (
      host === "soundcloud.com" ||
      host === "www.soundcloud.com" ||
      host === "m.soundcloud.com" ||
      host === "on.soundcloud.com" ||
      host.endsWith(".soundcloud.com")
    );

  } catch {

    return false;
  }
}


/* =====================================================
   LARGE AUDIO UPLOAD
===================================================== */

function uploadLargeAudio(
  storageRef,
  file,
  statusEl
) {

  return new Promise(
    (resolve, reject) => {

      const contentType =
        file.type ||
        (
          file.name
            .toLowerCase()
            .endsWith(".mp3")
            ? "audio/mpeg"
            : "audio/aiff"
        );


      const task =
        uploadBytesResumable(
          storageRef,
          file,
          {
            contentType
          }
        );


      task.on(

        "state_changed",

        snapshot => {

          const pct =
            snapshot.totalBytes
              ? Math.round(
                  (
                    snapshot.bytesTransferred /
                    snapshot.totalBytes
                  ) * 100
                )
              : 0;

          statusEl.textContent =
            `Uploading… ${pct}%`;
        },

        error => {
          reject(error);
        },

        () => {
          resolve(task.snapshot);
        }

      );

    }
  );
}


/* =====================================================
   ADD MIX
===================================================== */

mixForm.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    const submit =
      e.target.querySelector(
        'button[type="submit"]'
      );

    const name =
      document
        .querySelector("#mixName")
        .value
        .trim();

    const latest =
      document
        .querySelector("#isLatest")
        .checked;

    const sourceType =
      mixSource.value;


    if (
      !name ||
      name.length > 150
    ) {

      mixStatus.textContent =
        "Mix name must be 1–150 characters.";

      return;
    }


    mixStatus.textContent =
      sourceType === "upload"
        ? "Preparing upload…"
        : "Saving SoundCloud mix…";


    submit.disabled = true;

    let storageRef = null;


    try {

      let mixData;


      /* =================================================
         DIRECT FILE UPLOAD
      ================================================= */

      if (sourceType === "upload") {

        const file =
          mixFile.files[0];


        const lower =
          file?.name?.toLowerCase() || "";


        const allowedExt =
          lower.endsWith(".mp3") ||
          lower.endsWith(".aif") ||
          lower.endsWith(".aiff");


        const allowedType = [
          "audio/mpeg",
          "audio/aiff",
          "audio/x-aiff",
          "audio/x-aif"
        ].includes(
          file?.type || ""
        );


        if (
          !file ||
          (
            !allowedExt &&
            !allowedType
          )
        ) {

          mixStatus.textContent =
            "Please select an MP3, AIF, or AIFF file.";

          return;
        }


        if (
          file.size <= 0 ||
          file.size >
            2 *
            1024 *
            1024 *
            1024
        ) {

          mixStatus.textContent =
            "Audio file must be larger than 0 bytes and no more than 2 GB.";

          return;
        }


        const safe =
          file.name.replace(
            /[^a-z0-9._-]/gi,
            "-"
          );


        const path =
          `mixes/${crypto.randomUUID()}-${safe}`;


        storageRef =
          ref(
            storage,
            path
          );


        await uploadLargeAudio(
          storageRef,
          file,
          mixStatus
        );


        mixData = {

          name,

          sourceType:
            "upload",

          storagePath:
            path,

          isLatest:
            latest,

          createdAt:
            new Date().toISOString()

        };

      }


      /* =================================================
         SOUNDCLOUD
      ================================================= */

      else if (sourceType === "soundcloud") {

        const url =
          soundcloudUrl.value.trim();


        if (!isValidSoundCloudUrl(url)) {

          mixStatus.textContent =
            "Enter a valid SoundCloud link.";

          return;
        }


        mixData = {

          name,

          sourceType:
            "soundcloud",

          soundcloudUrl:
            url,

          isLatest:
            latest,

          createdAt:
            new Date().toISOString()

        };

      }


      /* =================================================
         UNKNOWN SOURCE
      ================================================= */

      else {

        throw new Error(
          `Unknown mix source: ${sourceType}`
        );

      }


      /* =================================================
         SAVE MIX TO FIRESTORE
      ================================================= */

      const newDoc =
        await addDoc(
          collection(
            db,
            "mixes"
          ),
          mixData
        );


      /* =================================================
         SET LATEST MIX
      ================================================= */

      if (latest) {

        const all =
          await getDocs(
            collection(
              db,
              "mixes"
            )
          );


        await Promise.all(

          all.docs

            .filter(
              d =>
                d.id !== newDoc.id &&
                d.data().isLatest === true
            )

            .map(
              d =>
                updateDoc(
                  d.ref,
                  {
                    isLatest: false
                  }
                )
            )

        );

      }


      mixStatus.textContent =
        sourceType === "upload"
          ? "Mix uploaded successfully."
          : "SoundCloud mix added successfully.";


      e.target.reset();

      syncMixSourceFields();

      await loadMixes();


    } catch (err) {

      console.error(
        "Mix add failed:",
        err
      );


      if (storageRef) {

        try {

          await deleteObject(
            storageRef
          );

        } catch (deleteErr) {

          console.warn(
            "Cleanup failed:",
            deleteErr
          );

        }

      }


      mixStatus.textContent =
        `${err?.code || "ERROR"}: ${err?.message || String(err)}`;


    } finally {

      submit.disabled = false;

    }

  }
);


/* =====================================================
   LOAD MIX LIBRARY
===================================================== */

async function loadMixes() {

  const el =
    document.querySelector(
      "#adminMixes"
    );


  el.innerHTML =
    "Loading…";


  try {

    const snap =
      await getDocs(

        query(

          collection(
            db,
            "mixes"
          ),

          orderBy(
            "createdAt",
            "desc"
          )

        )

      );


    if (snap.empty) {

      el.innerHTML = `
        <div class="empty">
          No mixes yet.
        </div>
      `;

      return;
    }


    el.innerHTML =
      snap.docs

        .map(d => {

          const x =
            d.data();


          const source =
            x.sourceType === "soundcloud"
              ? "SOUNDCLOUD"
              : "UPLOAD";


          return `

            <div class="admin-row">

              <div>

                <strong>
                  ${esc(x.name)}
                </strong>

                <small>

                  ${
                    x.isLatest
                      ? "LATEST • "
                      : ""
                  }

                  ${source}

                  •

                  ${esc(
                    formatDate(
                      x.createdAt
                    )
                  )}

                </small>

              </div>


              <div>

                <button
                  class="small-btn latestBtn"
                  data-id="${d.id}"
                >
                  MAKE LATEST
                </button>

                <button
                  class="small-btn danger deleteMix"
                  data-id="${d.id}"
                  data-path="${esc(
                    x.storagePath || ""
                  )}"
                  data-source="${esc(
                    x.sourceType || "upload"
                  )}"
                >
                  DELETE
                </button>

              </div>

            </div>

          `;

        })

        .join("");


    /* =================================================
       MAKE LATEST
    ================================================= */

    document
      .querySelectorAll(
        ".latestBtn"
      )
      .forEach(b => {

        b.onclick =
          async () => {

            try {

              const all =
                await getDocs(
                  collection(
                    db,
                    "mixes"
                  )
                );


              await Promise.all(

                all.docs

                  .filter(
                    d =>
                      d.data().isLatest !==
                      (
                        d.id ===
                        b.dataset.id
                      )
                  )

                  .map(
                    d =>
                      updateDoc(
                        d.ref,
                        {
                          isLatest:
                            d.id ===
                            b.dataset.id
                        }
                      )
                  )

              );


              await loadMixes();


            } catch (err) {

              console.error(
                "Set latest failed",
                err
              );


              alert(
                `${err?.code || "ERROR"}: ${err?.message || "Could not change Latest Mix."}`
              );

            }

          };

      });


    /* =================================================
       DELETE MIX
    ================================================= */

    document
      .querySelectorAll(
        ".deleteMix"
      )
      .forEach(b => {

        b.onclick =
          async () => {

            if (
              !confirm(
                "Delete this mix? This removes the audio file and its listing."
              )
            ) {
              return;
            }


            try {

              if (
                b.dataset.source !==
                  "soundcloud" &&
                b.dataset.path
              ) {

                try {

                  await deleteObject(
                    ref(
                      storage,
                      b.dataset.path
                    )
                  );

                } catch (err) {

                  if (
                    err?.code !==
                    "storage/object-not-found"
                  ) {
                    throw err;
                  }

                }

              }


              await deleteDoc(
                doc(
                  db,
                  "mixes",
                  b.dataset.id
                )
              );


              await loadMixes();


            } catch (err) {

              console.error(
                "Delete mix failed",
                err
              );


              alert(
                `${err?.code || "ERROR"}: ${err?.message || "Delete failed."}`
              );

            }

          };

      });


  } catch (err) {

    console.error(
      "Admin mix load failed",
      err
    );


    el.innerHTML = `
      <div class="empty">
        Unable to load mixes.<br><br>
        ${esc(err?.code || "ERROR")}:
        ${esc(err?.message || String(err))}
      </div>
    `;

  }

}


/* =====================================================
   LOAD BOOKING REQUESTS
===================================================== */

async function loadBookings() {

  const el =
    document.querySelector(
      "#bookings"
    );


  el.innerHTML =
    "Loading…";


  try {

    const snap =
      await getDocs(

        query(

          collection(
            db,
            "bookings"
          ),

          orderBy(
            "createdAt",
            "desc"
          )

        )

      );


    if (snap.empty) {

      el.innerHTML = `
        <div class="empty">
          No booking requests yet.
        </div>
      `;

      return;
    }


    el.innerHTML =
      snap.docs

        .map(d => {

          const x =
            d.data();


          return `

            <article class="booking">

              <div class="booking-top">

                <strong>
                  ${esc(
                    x.requesterName
                  )}
                </strong>

                <span>
                  ${esc(
                    x.status ||
                    "NEW"
                  )}
                </span>

              </div>


              <p>

                <b>
                  ${esc(
                    x.eventDate
                  )}
                </b>

                •

                ${esc(
                  x.requestedTime
                )}

                •

                ${esc(
                  x.eventType
                )}

              </p>


              <p>

                Genre:
                ${esc(
                  x.genre ||
                  "Open Format"
                )}

                •

                Deposit:
                ${esc(
                  x.depositMethod
                )}

              </p>


              <p>

                ${esc(
                  x.email
                )}

                •

                ${esc(
                  x.phone
                )}

              </p>


              ${
                x.details
                  ? `
                    <p>
                      ${esc(
                        x.details
                      )}
                    </p>
                  `
                  : ""
              }


              <div>

                <button
                  class="small-btn statusBtn"
                  data-id="${d.id}"
                  data-status="CONFIRMED"
                >
                  CONFIRM
                </button>


                <button
                  class="small-btn statusBtn"
                  data-id="${d.id}"
                  data-status="DEPOSIT RECEIVED"
                >
                  DEPOSIT RECEIVED
                </button>


                <button
                  class="small-btn statusBtn"
                  data-id="${d.id}"
                  data-status="COMPLETED"
                >
                  COMPLETED
                </button>

              </div>

            </article>

          `;

        })

        .join("");


    /* =================================================
       UPDATE BOOKING STATUS
    ================================================= */

    document
      .querySelectorAll(
        ".statusBtn"
      )
      .forEach(b => {

        b.onclick =
          async () => {

            try {

              await updateDoc(
                doc(
                  db,
                  "bookings",
                  b.dataset.id
                ),
                {
                  status:
                    b.dataset.status
                }
              );


              await loadBookings();


            } catch (err) {

              console.error(
                "Booking status update failed",
                err
              );


              alert(
                `${err?.code || "ERROR"}: ${err?.message || "Could not update booking."}`
              );

            }

          };

      });


  } catch (err) {

    console.error(
      "Booking load failed",
      err
    );


    el.innerHTML = `
      <div class="empty">
        Unable to load bookings.<br><br>
        ${esc(err?.code || "ERROR")}:
        ${esc(err?.message || String(err))}
      </div>
    `;

  }

}
