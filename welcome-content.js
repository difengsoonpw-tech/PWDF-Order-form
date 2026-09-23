/*****************************************************
 * NEW CUSTOMER PAGE — ALL THE WORDS AND PHOTOS LIVE HERE
 *
 * You never need to touch welcome.html. To change what the
 * page says, edit the text between the "quotes" below, save,
 * and upload this file to GitHub. That's it.
 *
 * Rules of thumb:
 *  - Keep the "quotes" and the commas at the end of each line.
 *  - To swap a photo, put a new picture in the "showcase" folder
 *    and change the file name here (e.g. "showcase/cakes.jpg").
 *  - Text in [square brackets] is a placeholder — replace it.
 *****************************************************/
const WELCOME_CONTENT = {

  // The WhatsApp number people chat with (country code, no + or spaces)
  whatsappNumber: "60143755008",

  // The message that is pre-typed when someone taps a WhatsApp button
  whatsappGreeting: "Hi! I found you through your website and would like to know more.",

  // ---------- TOP OF THE PAGE ----------
  hero: {
    eyebrow: "[Small line above the headline]",
    headline: "[Your headline goes here]",
    subline: "[One or two sentences: who you supply, and why a new customer should try you.]",
    primaryButton: "Chat on WhatsApp",
    secondaryButton: "Leave your details",
    photos: ["showcase/hero-cake.jpg", "showcase/hero-macaron.jpg", "showcase/hero-croissant.jpg"]
  },

  // ---------- THE PRODUCT RANGE ----------
  rangeTitle: "[Title for the product section]",
  rangeIntro: "[A short sentence introducing the range.]",
  categories: [
    { name: "Whole cakes",           photo: "showcase/cakes.jpg",      text: "[Short description of this range.]" },
    { name: "Individual cakes",      photo: "showcase/slices.jpg",     text: "[Short description of this range.]" },
    { name: "Macarons",              photo: "showcase/macarons.jpg",   text: "[Short description of this range.]" },
    { name: "Croissants & Danish",   photo: "showcase/croissants.jpg", text: "[Short description of this range.]" },
    { name: "Artisan bread",         photo: "showcase/bread.jpg",      text: "[Short description of this range.]" },
    { name: "Burger buns",           photo: "showcase/buns.jpg",       text: "[Short description of this range.]" },
    { name: "Donuts",                photo: "showcase/donuts.jpg",     text: "[Short description of this range.]" }
  ],

  // ---------- WHY CHOOSE US (3 short points) ----------
  whyTitle: "[Title for the reasons section]",
  reasons: [
    { title: "[Reason 1]", text: "[One sentence explaining it.]" },
    { title: "[Reason 2]", text: "[One sentence explaining it.]" },
    { title: "[Reason 3]", text: "[One sentence explaining it.]" }
  ],

  // ---------- THE LEAD FORM ----------
  formTitle: "[Title above the form]",
  formIntro: "[One line telling them what happens after they send it.]",
  formButton: "Send my details",
  thankYouTitle: "Thank you!",
  thankYouText: "We've received your details and will WhatsApp you soon.",

  // Options in the "Type of business" dropdown
  businessTypes: ["Café", "Restaurant", "Hotel", "Catering", "Bakery / Retail", "Other"],

  // ---------- BOTTOM OF THE PAGE ----------
  footerNote: "[Company name · short address or area served]"
};
