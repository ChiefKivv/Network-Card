import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app-check.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

import {
  firebaseConfig,
  APP_CHECK_SITE_KEY
} from "./firebase-config.js";


/* =====================================================
   FIREBASE
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

const db = getFirestore(app);
const storage = getStorage(app);


/* =====================================================
   PAGE ELEMENTS
===================================================== */

const latestEl = document.querySelector("#latest");
const listEl = document.querySelector("#mixList");
const player = document.querySelector("#player");

const modal = document.querySelector("#bookingModal");
const form = document.querySelector("#bookingForm");
const status = document.querySelector("#bookingStatus");

const submitButton =
  form.querySelector('button[type="submit"]');

const bookingSuccess =
  document.querySelector("#bookingSuccess");

const eventDate =
  form.querySelector('input[name="eventDate"]');


eventDate.min =
  new Date()
    .toISOString()
    .slice(0, 10);


/* =====================================================
   HELPERS
===================================================== */

function escapeHTML(value = "") {
  const s = String(value);

  return s.replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}


function closeBookingModal() {
  modal.classList.remove("show");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}


/* =====================================================
   SOUNDCLOUD URL CHECK
===================================================== */

function isSoundCloudUrl(value) {
  try {
    const url = new URL(value);

    const host =
      url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (
        host === "soundcloud.com" ||
        host.endsWith(".soundcloud.com")
      )
    );

  } catch {
    return false;
  }
}


/* =====================================================
   SOUNDCLOUD OEMBED
===================================================== */

async function getSoundCloudEmbed(url) {

  if (!isSoundCloudUrl(url)) {
    throw new Error(
      "Invalid SoundCloud URL."
    );
  }


  const endpoint =
    "https://soundcloud.com/oembed" +
    "?format=json" +
    "&maxheight=166" +
    "&auto_play=false" +
    "&show_comments=false" +
    "&url=" +
    encodeURIComponent(url);


  const response =
    await fetch(endpoint);


  if (!response.ok) {
    throw new Error(
      `SoundCloud returned ${response.status}.`
    );
  }


  const data =
    await response.json();


  if (!data?.html) {
    throw new Error(
      "SoundCloud did not return a playable embed."
    );
  }


  return data.html;
}


/* =====================================================
   SOUNDCLOUD PLAYER
===================================================== */

async function playSoundCloudMix(mix) {

  player.pause();
  player.removeAttribute("src");
  player.style.display = "none";


  let container =
    document.querySelector(
      "#soundcloudPlayer"
    );


  if (!container) {

    container =
      document.createElement("div");

    container.id =
      "soundcloudPlayer";


    player.insertAdjacentElement(
      "beforebegin",
      container
    );

  }


  container.hidden = false;


  container.innerHTML = `
    <div class="empty">
      Loading SoundCloud player…
    </div>
  `;


  container.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });


  try {

    const embedHTML =
      await getSoundCloudEmbed(
        mix.soundcloudUrl
      );


    container.innerHTML =
      embedHTML;


    const iframe =
      container.querySelector("iframe");


    if (iframe) {

      iframe.width = "100%";
      iframe.height = "166";
      iframe.style.border = "0";

      iframe.setAttribute(
        "allow",
        "autoplay"
      );

      iframe.setAttribute(
        "scrolling",
        "no"
      );

      iframe.setAttribute(
        "title",
        `SoundCloud player - ${mix.name}`
      );

    }


  } catch (err) {

    console.error(
      "SoundCloud embed failed",
      err
    );


    container.innerHTML = `
      <div class="latest-card">

        <strong>
          ${escapeHTML(mix.name)}
        </strong>

        <p class="muted">
          This mix could not be played directly on this page.
        </p>

        <a
          class="action primary"
          href="${escapeHTML(mix.soundcloudUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ▶ OPEN IN SOUNDCLOUD
        </a>

      </div>
    `;

  }
}


/* =====================================================
   PLAY MIX
===================================================== */

async function playMix(mix) {

  if (
    mix.sourceType === "soundcloud" &&
    mix.soundcloudUrl
  ) {

    await playSoundCloudMix(mix);

    return;
  }


  const sc =
    document.querySelector(
      "#soundcloudPlayer"
    );


  if (sc) {
    sc.hidden = true;
    sc.innerHTML = "";
  }


  player.style.display = "";


  if (!mix.url) {
    console.error(
      "No playable URL for mix",
      mix
    );

    return;
  }


  player.src =
    mix.url;


  try {
    await player.play();
  } catch (err) {
    console.warn(
      "Autoplay prevented",
      err
    );
  }


  player.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


/* =====================================================
   LOAD MIXES
===================================================== */

async function loadMixes() {

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
          ),

          limit(50)

        )

      );


    const mixes = [];


    for (
      const docSnap
      of snap.docs
    ) {

      const data =
        docSnap.data();


      const mix = {
        ...data,
        id: docSnap.id
      };


      /* SOUNDCLOUD */

      if (
        data.sourceType === "soundcloud" &&
        data.soundcloudUrl
      ) {

        mixes.push(mix);

        continue;
      }


      /* DIRECT UPLOAD */

      if (!data.storagePath) {
        continue;
      }


      try {

        mix.url =
          await getDownloadURL(
            ref(
              storage,
              data.storagePath
            )
          );


        mix.sourceType =
          mix.sourceType ||
          "upload";


        mixes.push(mix);


      } catch (err) {

        console.warn(
          "Skipped unavailable mix",
          docSnap.id,
          err
        );

      }

    }


    const latest =
      mixes.find(
        m => m.isLatest
      ) ||
      mixes[0];


    latestEl.innerHTML =
      latest

        ? `
          <div class="latest-card">

            <span class="eyebrow">
              LATEST MIX
            </span>

            <strong>
              ${escapeHTML(latest.name)}
            </strong>

            <button
              class="play-latest"
              data-mix-id="${escapeHTML(latest.id)}"
              type="button"
            >
              ▶ PLAY
            </button>

          </div>
        `

        : `
          <div class="empty">
            No mixes have been published yet.
          </div>
        `;


    const otherMixes =
      mixes.filter(
        m =>
          !latest ||
          m.id !== latest.id
      );


    listEl.innerHTML =
      otherMixes.length

        ? otherMixes
            .map(
              m => `
                <button
                  class="mix-row"
                  data-mix-id="${escapeHTML(m.id)}"
                  type="button"
                >

                  <span>
                    ${escapeHTML(m.name)}
                  </span>

                  <b>▶</b>

                </button>
              `
            )
            .join("")

        : `
          <div class="empty">
            More mixes coming soon.
          </div>
        `;


    const byId =
      new Map(
        mixes.map(
          m => [
            m.id,
            m
          ]
        )
      );


    document
      .querySelectorAll(
        "[data-mix-id]"
      )
      .forEach(
        btn => {

          btn.addEventListener(
            "click",
            async () => {

              const mix =
                byId.get(
                  btn.dataset.mixId
                );


              if (mix) {
                await playMix(mix);
              }

            }
          );

        }
      );


  } catch (err) {

    console.error(
      "Mix load failed",
      err
    );


    latestEl.innerHTML =
      "";


    listEl.innerHTML = `
      <div class="empty">
        Mix library is unavailable.
        Please try again shortly.
      </div>
    `;

  }

}


/* =====================================================
   BOOKING MODAL
===================================================== */

document
  .querySelector("#bookingOpen")
  .onclick =
    () => {

      bookingSuccess.hidden = true;
      status.textContent = "";
      submitButton.hidden = false;

      modal.classList.add(
        "show"
      );

      modal.setAttribute(
        "aria-hidden",
        "false"
      );

    };


document
  .querySelector("#bookingClose")
  .onclick =
    closeBookingModal;


modal.addEventListener(
  "click",
  e => {

    if (e.target === modal) {
      closeBookingModal();
    }

  }
);


document.addEventListener(
  "keydown",
  e => {

    if (
      e.key === "Escape" &&
      modal.classList.contains("show")
    ) {

      closeBookingModal();

    }

  }
);


/* =====================================================
   BOOKING FORM
===================================================== */

form.addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    if (!form.reportValidity()) {
      return;
    }


    const fd =
      new FormData(form);


    if (
      (
        fd.get("website") || ""
      ).trim()
    ) {

      status.textContent =
        "Unable to submit right now. Please call/text 347-771-7483.";

      return;
    }


    fd.delete(
      "website"
    );


    const data =
      Object.fromEntries(
        fd.entries()
      );


    data.genre =
      (
        data.genre ||
        "Open Format"
      ).trim();


    data.eventType =
      data.eventType.trim();


    data.requesterName =
      data.requesterName.trim();


    data.email =
      data.email.trim();


    data.phone =
      data.phone.trim();


    data.details =
      (
        data.details ||
        ""
      ).trim();


    if (!data.details) {
      delete data.details;
    }


    data.createdAt =
      new Date()
        .toISOString();


    data.status =
      "NEW";


    status.textContent =
      "Submitting…";


    submitButton.disabled =
      true;


    try {

      await addDoc(
        collection(
          db,
          "bookings"
        ),
        data
      );


      form.reset();


      eventDate.min =
        new Date()
          .toISOString()
          .slice(0, 10);


      status.textContent = "";

      submitButton.hidden = true;

      bookingSuccess.hidden = false;


    } catch (err) {

      console.error(
        "Booking submission failed",
        err
      );


      status.textContent =
        "Unable to submit right now. Please call/text 347-771-7483.";


    } finally {

      submitButton.disabled =
        false;

    }

  }
);


/* =====================================================
   START
===================================================== */

loadMixes();
