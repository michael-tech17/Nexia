/* ========================================== */
/* 1. LOGIQUE PRINCIPALE DE L'APPLICATION QUIZ   */
/* ========================================== */

/* -------------------------------------------------------------- */
/* FIREBASE — initialisation et classement Firestore              */
/* -------------------------------------------------------------- */
import { initializeApp }                          from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, collection, addDoc,
         query, where, orderBy, limit,
         getDocs }                                from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyDoGmIzJVldQn9GugOX3ip75BCES9h2kIg",
    authDomain:        "quiz-multi-domaines.firebaseapp.com",
    projectId:         "quiz-multi-domaines",
    storageBucket:     "quiz-multi-domaines.firebasestorage.app",
    messagingSenderId: "930782855205",
    appId:             "1:930782855205:web:84b2472e987a64d6c73fcc"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* -------------------------------------------------------------- */
/* 2. CLASSEMENT CLOUD — lecture / écriture dans Firestore           */
/* -------------------------------------------------------------- */
const CloudScore = {

    async push(domain, sub, entry) {
        try {
            const now        = new Date(entry.ts);
            const dateHeure  = now.toLocaleDateString('fr-FR', {
                day:   '2-digit', month: '2-digit', year: 'numeric'
            }) + ' à ' + now.toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            await addDoc(collection(db, "Score"), {
                domain:      domain,
                sub:         sub || "",
                name:        entry.name,
                score:       entry.score,
                total:       entry.total,
                pct:         entry.pct,
                ts:          entry.ts,
                dateHeure:   dateHeure,
                niveau:      entry.niveau || "",
                countryCode: entry.countryCode || "",
                countryName: entry.countryName || ""
            });
        } catch (e) {
            console.warn("Erreur écriture Firestore :", e);
        }
    },

    async load(domain, sub) {
        try {
            const q = query(
                collection(db, "Score"),
                where("domain", "==", domain),
                where("sub",    "==", sub || ""),
                orderBy("score", "desc"),
                orderBy("ts",    "asc"),
                limit(50)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.warn("Erreur lecture Firestore :", e);
            return [];
        }
    },

    /* Enregistre le résultat d'une réponse individuelle dans la collection "Reponses" */
    async pushReponse(domain, sub, niveau, question, options, reponseCorrecteIndex, optionChoisieIndex, resultat) {
        // resultat : "correct" | "incorrect" | "timeout"
        try {
            await addDoc(collection(db, "Reponses"), {
                domain:              domain,
                sub:                 sub || "",
                niveau:              niveau || "",
                question:            question,
                options:             options,
                reponseCorrecte:     options[reponseCorrecteIndex] || "",
                optionChoisie:       optionChoisieIndex === -1 ? null : (options[optionChoisieIndex] || null),
                resultat:            resultat,  // "correct" | "incorrect" | "timeout"
                ts:                  Date.now()
            });
        } catch (e) {
            console.warn("Erreur enregistrement réponse :", e);
        }
    }
};

/* -------------------------------------------------------------- */
/* 3. NORMALISATION : convertit une question en format interne       */
/* -------------------------------------------------------------- */
function normalizeQuestion(q) {
    const niveauMap = {
        'debutant':      'débutant',
        'intermediaire': 'intermédiaire',
        'avance':        'avancé',
        'débutant':      'débutant',
        'intermédiaire': 'intermédiaire',
        'avancé':        'avancé'
    };
    const niveauBrut = (q.niveau || '').trim().toLowerCase();
    return {
        question:    q.question,
        code:        q.code || "",
        options:     q.options,
        reponse:     q.reponse,
        explication: q.explication || "",
        niveau:      niveauMap[niveauBrut] || niveauBrut,
        isDinoImg:   q.question && q.question.includes("représenté sur cette image")
    };
}

/* -------------------------------------------------------------- */
/* 4. APLATIT un objet de sous-tableaux en un seul tableau           */
/* -------------------------------------------------------------- */
function flattenDomain(obj) {
    if (Array.isArray(obj)) return obj.map(normalizeQuestion);
    return Object.values(obj).flatMap(v =>
        Array.isArray(v) ? v.map(normalizeQuestion) : flattenDomain(v)
    );
}

/* -------------------------------------------------------------- */
/* 5. DONNÉES                                                         */
/* -------------------------------------------------------------- */
const quizData = {
    informatique: {
        programmation: flattenDomain(informatique.programmation),
        reseaux:       flattenDomain(informatique.reseaux)
    },
    droit:            flattenDomain(droit),
    medecine:         flattenDomain(medecine),
    capitales_pays: {
        pays:      flattenDomain(capitales_pays.pays_du_monde),
        capitales: flattenDomain(capitales_pays.capitales_du_monde)
    },
    culture_generale: flattenDomain(culture_generale),
    langues: {
        francais: flattenDomain(langues.francais),
        anglais:  flattenDomain(langues.anglais)
    },
    psychologie:  flattenDomain(psychologie),
    astronomie:   flattenDomain(astronomie),
    dinosaures:   flattenDomain(dinosaures)
};

const NOM_DOMAINES = {
    informatique:     "Informatique",
    droit:            "Droit",
    medecine:         "Médecine",
    capitales_pays:   "Capitales & Pays",
    culture_generale: "Culture générale",
    langues:          "Langues & Linguistique",
    psychologie:      "Psychologie & Comportement",
    astronomie:       "Astronomie & Espace",
    programmation:    "Développement Web & Mobile",
    reseaux:          "Réseaux & Systèmes",
    capitales:        "Capitales du monde",
    pays:             "Pays du monde — Drapeaux",
    francais:         "🇫🇷 Langue française",
    anglais:          "🇬🇧 Langue anglaise",
    dinosaures:       "🦖 Dinosaures & Préhistoire"
};

/* -------------------------------------------------------------- */
/* 6. ÉTAT GLOBAL                                                     */
/* -------------------------------------------------------------- */
let currentUser          = "";
let currentDomainKey     = "";
let currentSubKey        = "";
let currentNiveau        = "";
let activeQuestions      = [];
let currentQuestionIndex = 0;
let score                = 0;
let timerID              = null;
let tempsRestant         = 20;
let aRepondu             = false;
let currentCountry       = null; // { code, name, flag }

/* -------------------------------------------------------------- */
/* 7. DONNÉES PAYS — classées par continent                          */
/* -------------------------------------------------------------- */
const PAYS_PAR_CONTINENT = {
    "Afrique": [
        { code: "DZ", name: "Algérie" }, { code: "AO", name: "Angola" },
        { code: "BJ", name: "Bénin" }, { code: "BW", name: "Botswana" },
        { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
        { code: "CV", name: "Cap-Vert" }, { code: "CM", name: "Cameroun" },
        { code: "CF", name: "Centrafrique" }, { code: "KM", name: "Comores" },
        { code: "CG", name: "Congo" }, { code: "CD", name: "Congo (RDC)" },
        { code: "CI", name: "Côte d'Ivoire" }, { code: "DJ", name: "Djibouti" },
        { code: "EG", name: "Égypte" }, { code: "GQ", name: "Guinée équatoriale" },
        { code: "ER", name: "Érythrée" }, { code: "SZ", name: "Eswatini" },
        { code: "ET", name: "Éthiopie" }, { code: "GA", name: "Gabon" },
        { code: "GM", name: "Gambie" }, { code: "GH", name: "Ghana" },
        { code: "GN", name: "Guinée" }, { code: "GW", name: "Guinée-Bissau" },
        { code: "KE", name: "Kenya" }, { code: "LS", name: "Lesotho" },
        { code: "LR", name: "Libéria" }, { code: "LY", name: "Libye" },
        { code: "MG", name: "Madagascar" }, { code: "MW", name: "Malawi" },
        { code: "ML", name: "Mali" }, { code: "MR", name: "Mauritanie" },
        { code: "MU", name: "Maurice" }, { code: "MA", name: "Maroc" },
        { code: "MZ", name: "Mozambique" }, { code: "NA", name: "Namibie" },
        { code: "NE", name: "Niger" }, { code: "NG", name: "Nigéria" },
        { code: "RW", name: "Rwanda" }, { code: "ST", name: "São Tomé" },
        { code: "SN", name: "Sénégal" }, { code: "SC", name: "Seychelles" },
        { code: "SL", name: "Sierra Leone" }, { code: "SO", name: "Somalie" },
        { code: "ZA", name: "Afrique du Sud" }, { code: "SS", name: "Soudan du Sud" },
        { code: "SD", name: "Soudan" }, { code: "TZ", name: "Tanzanie" },
        { code: "TD", name: "Tchad" }, { code: "TG", name: "Togo" },
        { code: "TN", name: "Tunisie" }, { code: "UG", name: "Ouganda" },
        { code: "ZM", name: "Zambie" }, { code: "ZW", name: "Zimbabwe" }
    ],
    "Amériques": [
        { code: "AG", name: "Antigua-et-Barbuda" }, { code: "AR", name: "Argentine" },
        { code: "BS", name: "Bahamas" }, { code: "BB", name: "Barbade" },
        { code: "BZ", name: "Belize" }, { code: "BO", name: "Bolivie" },
        { code: "BR", name: "Brésil" }, { code: "CA", name: "Canada" },
        { code: "CL", name: "Chili" }, { code: "CO", name: "Colombie" },
        { code: "CR", name: "Costa Rica" }, { code: "CU", name: "Cuba" },
        { code: "DM", name: "Dominique" }, { code: "DO", name: "Rép. dominicaine" },
        { code: "EC", name: "Équateur" }, { code: "SV", name: "Salvador" },
        { code: "GD", name: "Grenade" }, { code: "GT", name: "Guatemala" },
        { code: "GY", name: "Guyana" }, { code: "HT", name: "Haïti" },
        { code: "HN", name: "Honduras" }, { code: "JM", name: "Jamaïque" },
        { code: "MX", name: "Mexique" }, { code: "NI", name: "Nicaragua" },
        { code: "PA", name: "Panama" }, { code: "PY", name: "Paraguay" },
        { code: "PE", name: "Pérou" }, { code: "KN", name: "Saint-Kitts" },
        { code: "LC", name: "Sainte-Lucie" }, { code: "VC", name: "Saint-Vincent" },
        { code: "SR", name: "Suriname" }, { code: "TT", name: "Trinité-et-Tobago" },
        { code: "US", name: "États-Unis" }, { code: "UY", name: "Uruguay" },
        { code: "VE", name: "Venezuela" }
    ],
    "Asie": [
        { code: "AF", name: "Afghanistan" }, { code: "AM", name: "Arménie" },
        { code: "AZ", name: "Azerbaïdjan" }, { code: "BH", name: "Bahreïn" },
        { code: "BD", name: "Bangladesh" }, { code: "BT", name: "Bhoutan" },
        { code: "BN", name: "Brunei" }, { code: "KH", name: "Cambodge" },
        { code: "CN", name: "Chine" }, { code: "CY", name: "Chypre" },
        { code: "KP", name: "Corée du Nord" }, { code: "KR", name: "Corée du Sud" },
        { code: "AE", name: "Émirats arabes unis" }, { code: "GE", name: "Géorgie" },
        { code: "IN", name: "Inde" }, { code: "ID", name: "Indonésie" },
        { code: "IQ", name: "Irak" }, { code: "IR", name: "Iran" },
        { code: "IL", name: "Israël" }, { code: "JP", name: "Japon" },
        { code: "JO", name: "Jordanie" }, { code: "KZ", name: "Kazakhstan" },
        { code: "KW", name: "Koweït" }, { code: "KG", name: "Kirghizistan" },
        { code: "LA", name: "Laos" }, { code: "LB", name: "Liban" },
        { code: "MY", name: "Malaisie" }, { code: "MV", name: "Maldives" },
        { code: "MN", name: "Mongolie" }, { code: "MM", name: "Myanmar" },
        { code: "NP", name: "Népal" }, { code: "OM", name: "Oman" },
        { code: "UZ", name: "Ouzbékistan" }, { code: "PK", name: "Pakistan" },
        { code: "PS", name: "Palestine" }, { code: "PH", name: "Philippines" },
        { code: "QA", name: "Qatar" }, { code: "SA", name: "Arabie saoudite" },
        { code: "SG", name: "Singapour" }, { code: "LK", name: "Sri Lanka" },
        { code: "SY", name: "Syrie" }, { code: "TJ", name: "Tadjikistan" },
        { code: "TW", name: "Taïwan" }, { code: "TH", name: "Thaïlande" },
        { code: "TL", name: "Timor oriental" }, { code: "TM", name: "Turkménistan" },
        { code: "TR", name: "Turquie" }, { code: "VN", name: "Vietnam" },
        { code: "YE", name: "Yémen" }
    ],
    "Europe": [
        { code: "AL", name: "Albanie" }, { code: "DE", name: "Allemagne" },
        { code: "AD", name: "Andorre" }, { code: "AT", name: "Autriche" },
        { code: "BY", name: "Biélorussie" }, { code: "BE", name: "Belgique" },
        { code: "BA", name: "Bosnie-Herzégovine" }, { code: "BG", name: "Bulgarie" },
        { code: "HR", name: "Croatie" }, { code: "DK", name: "Danemark" },
        { code: "ES", name: "Espagne" }, { code: "EE", name: "Estonie" },
        { code: "FI", name: "Finlande" }, { code: "FR", name: "France" },
        { code: "GR", name: "Grèce" }, { code: "HU", name: "Hongrie" },
        { code: "IE", name: "Irlande" }, { code: "IS", name: "Islande" },
        { code: "IT", name: "Italie" }, { code: "LV", name: "Lettonie" },
        { code: "LI", name: "Liechtenstein" }, { code: "LT", name: "Lituanie" },
        { code: "LU", name: "Luxembourg" }, { code: "MT", name: "Malte" },
        { code: "MD", name: "Moldavie" }, { code: "MC", name: "Monaco" },
        { code: "ME", name: "Monténégro" }, { code: "NO", name: "Norvège" },
        { code: "NL", name: "Pays-Bas" }, { code: "PL", name: "Pologne" },
        { code: "PT", name: "Portugal" }, { code: "CZ", name: "Tchéquie" },
        { code: "MK", name: "Macédoine du Nord" }, { code: "RO", name: "Roumanie" },
        { code: "GB", name: "Royaume-Uni" }, { code: "RU", name: "Russie" },
        { code: "SM", name: "Saint-Marin" }, { code: "RS", name: "Serbie" },
        { code: "SK", name: "Slovaquie" }, { code: "SI", name: "Slovénie" },
        { code: "SE", name: "Suède" }, { code: "CH", name: "Suisse" },
        { code: "UA", name: "Ukraine" }, { code: "VA", name: "Vatican" }
    ],
    "Océanie": [
        { code: "AU", name: "Australie" }, { code: "FJ", name: "Fidji" },
        { code: "KI", name: "Kiribati" }, { code: "MH", name: "Îles Marshall" },
        { code: "FM", name: "Micronésie" }, { code: "NR", name: "Nauru" },
        { code: "NZ", name: "Nouvelle-Zélande" }, { code: "PW", name: "Palaos" },
        { code: "PG", name: "Papouasie-Nouvelle-Guinée" }, { code: "WS", name: "Samoa" },
        { code: "SB", name: "Îles Salomon" }, { code: "TO", name: "Tonga" },
        { code: "TV", name: "Tuvalu" }, { code: "VU", name: "Vanuatu" }
    ]
};

// Retourne l'URL de l'image drapeau via flagcdn.com (compatible Windows)
function flagUrl(code) {
    return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

// Liste à plat de tous les pays (triée par nom)
const TOUS_LES_PAYS = Object.entries(PAYS_PAR_CONTINENT).flatMap(([continent, pays]) =>
    pays.map(p => ({ ...p, continent }))
).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// ============================================================
// 8. AVATARS — 25 DINOSAURES AVEC IMAGES VIA WIKIPEDIA API
// Les images sont chargées dynamiquement via l'API Wikipedia
// pour contourner le blocage du hotlinking direct.
// ============================================================

// Cache des URLs d'images résolues
const avatarImgCache = {};

// Définition des avatars : id, label, emoji de fallback, page Wikipedia EN
const AVATARS = [
    { id: 'tyrannosaurus',     label: 'Tyrannosaure',       emoji: '🦖', wiki: 'Tyrannosaurus' },
    { id: 'triceratops',       label: 'Tricératops',        emoji: '🦕', wiki: 'Triceratops' },
    { id: 'velociraptor',      label: 'Vélociraptor',       emoji: '🦖', wiki: 'Velociraptor' },
    { id: 'stegosaurus',       label: 'Stégosaure',         emoji: '🦕', wiki: 'Stegosaurus' },
    { id: 'brachiosaurus',     label: 'Brachiosaure',       emoji: '🦕', wiki: 'Brachiosaurus' },
    { id: 'pterodactyl',       label: 'Ptérodactyle',       emoji: '🦅', wiki: 'Pteranodon' },
    { id: 'spinosaurus',       label: 'Spinosaurus',        emoji: '🦖', wiki: 'Spinosaurus' },
    { id: 'ankylosaurus',      label: 'Ankylosaure',        emoji: '🦕', wiki: 'Ankylosaurus' },
    { id: 'plesiosaurus',      label: 'Plésiosaure',        emoji: '🐊', wiki: 'Plesiosaurus' },
    { id: 'diplodocus',        label: 'Diplodocus',         emoji: '🦕', wiki: 'Diplodocus' },
    { id: 'oviraptor',         label: 'Oviraptor',          emoji: '🦖', wiki: 'Oviraptor' },
    { id: 'allosaurus',        label: 'Allosaure',          emoji: '🦖', wiki: 'Allosaurus' },
    { id: 'iguanodon',         label: 'Iguanodon',          emoji: '🦎', wiki: 'Iguanodon' },
    { id: 'parasaurolophus',   label: 'Parasaurolophus',   emoji: '🦕', wiki: 'Parasaurolophus' },
    { id: 'carnotaurus',       label: 'Carnotaurus',        emoji: '🦖', wiki: 'Carnotaurus' },
    { id: 'pachycephalosaurus',label: 'Pachycéphalosaure', emoji: '🦕', wiki: 'Pachycephalosaurus' },
    { id: 'giganotosaurus',    label: 'Giganotosaure',      emoji: '🦖', wiki: 'Giganotosaurus' },
    { id: 'dilophosaurus',     label: 'Dilophosaure',       emoji: '🦖', wiki: 'Dilophosaurus' },
    { id: 'therizinosaurus',   label: 'Therizinosaurus',    emoji: '🦕', wiki: 'Therizinosaurus' },
    { id: 'mosasaurus',        label: 'Mosasaurus',         emoji: '🐊', wiki: 'Mosasaurus' },
    { id: 'archaeopteryx',     label: 'Archéoptéryx',       emoji: '🦅', wiki: 'Archaeopteryx' },
    { id: 'gallimimus',        label: 'Gallimimus',         emoji: '🦕', wiki: 'Gallimimus' },
    { id: 'styracosaurus',     label: 'Styracosaure',       emoji: '🦕', wiki: 'Styracosaurus' },
    { id: 'deinonychus',       label: 'Deinonychus',        emoji: '🦖', wiki: 'Deinonychus' },
    { id: 'mosasaurus2',       label: 'Ichthyosaure',       emoji: '🐬', wiki: 'Ichthyosaurus' },
];

// Récupère l'URL de l'image via l'API Wikipedia (CORS-friendly) et met en cache
async function fetchWikiImage(wikiTitle, pxSize = 200) {
    if (avatarImgCache[wikiTitle]) return avatarImgCache[wikiTitle];
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&format=json&pithumbsize=${pxSize}&origin=*`;
        const resp = await fetch(url);
        const data = await resp.json();
        const pages = data.query.pages;
        const page  = Object.values(pages)[0];
        if (page.thumbnail && page.thumbnail.source) {
            avatarImgCache[wikiTitle] = page.thumbnail.source;
            return page.thumbnail.source;
        }
    } catch (e) {
        // silencieux, on utilisera l'emoji de fallback
    }
    return null;
}

// Génère le HTML interne du cercle avatar : image si disponible, sinon emoji
function buildAvatarCircleHTML(av, resolvedImgUrl) {
    if (resolvedImgUrl) {
        return `<img src="${resolvedImgUrl}" alt="${av.label}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
    }
    return `<span style="font-size:28px;line-height:1;">${av.emoji}</span>`;
}

/* -------------------------------------------------------------- */
/* 9. AVATAR SÉLECTIONNÉ                                             */
/* -------------------------------------------------------------- */
let currentAvatarId = null;

function getAvatarById(id) {
    return AVATARS.find(a => a.id === id) || AVATARS[0];
}

// Retourne l'URL d'image mise en cache, ou l'emoji encodé en data-URI (fallback)
function getAvatarImg(id) {
    const av = getAvatarById(id);
    if (avatarImgCache[av.wiki]) return avatarImgCache[av.wiki];
    // Fallback : génère une data-URI SVG avec l'emoji
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="100" fill="#e0f2fe"/><text x="100" y="130" font-size="90" text-anchor="middle">${av.emoji}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/* -------------------------------------------------------------- */
/* 10. GÉNÉRER LA GRILLE D'AVATARS — chargement asynchrone           */
/* -------------------------------------------------------------- */
async function renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = '';

    // Crée d'abord tous les boutons avec emoji (instantané)
    AVATARS.forEach(av => {
        const btn = document.createElement('button');
        btn.className = 'avatar-option';
        btn.dataset.id = av.id;
        btn.title = av.label;

        const circle = document.createElement('div');
        circle.className = 'avatar-circle';
        circle.innerHTML = `<span style="font-size:28px;line-height:1;">${av.emoji}</span>`;

        btn.innerHTML = '';
        btn.appendChild(circle);
        btn.insertAdjacentHTML('beforeend', `<span class="avatar-label">${av.label}</span>`);

        btn.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentAvatarId = av.id;
            document.getElementById('avatar-confirm-btn').disabled = false;
        });

        if (currentAvatarId === av.id) btn.classList.add('selected');
        grid.appendChild(btn);
    });

    // Charge les images Wikipedia en arrière-plan et les injecte au fur et à mesure
    AVATARS.forEach(async (av) => {
        const imgUrl = await fetchWikiImage(av.wiki, 200);
        if (!imgUrl) return;
        const btn = grid.querySelector(`[data-id="${av.id}"]`);
        if (!btn) return;
        const circle = btn.querySelector('.avatar-circle');
        if (!circle) return;
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = av.label;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        img.onload = () => { circle.innerHTML = ''; circle.appendChild(img); };
        img.onerror = () => { /* on garde l'emoji */ };
    });
}

/* -------------------------------------------------------------- */
/* 11. NAVIGATION                                                      */
/* -------------------------------------------------------------- */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

/* -------------------------------------------------------------- */
/* 12. ÉCRAN 1 : LOGIN                                                 */
/* -------------------------------------------------------------- */
const usernameInput = document.getElementById('username-input');
const startBtn      = document.getElementById('start-btn');

usernameInput.addEventListener('input', () => {
    startBtn.disabled = usernameInput.value.trim().length === 0;
});

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !startBtn.disabled) startBtn.click();
});

startBtn.addEventListener('click', () => {
    currentUser = usernameInput.value.trim();
    const savedAvatar  = localStorage.getItem('quiz_avatar_' + currentUser);
    const savedCountry = localStorage.getItem('quiz_country_' + currentUser);
    if (savedAvatar)  currentAvatarId = savedAvatar;
    if (savedCountry) currentCountry  = JSON.parse(savedCountry);

    // Pré-sélectionner le pays sauvegardé si existant
    renderCountryGrid('all', '');
    if (currentCountry) {
        document.getElementById('country-confirm-btn').disabled = false;
    }
    showScreen('country-screen');
});

/* -------------------------------------------------------------- */
/* 13. ÉCRAN PAYS — logique complète                                   */
/* -------------------------------------------------------------- */
let currentContinentFilter = 'all';

function renderCountryGrid(continent, search) {
    const grid = document.getElementById('country-grid');
    let liste = continent === 'all' ? TOUS_LES_PAYS
        : TOUS_LES_PAYS.filter(p => p.continent === continent);

    if (search.trim()) {
        const q = search.trim().toLowerCase();
        liste = liste.filter(p => p.name.toLowerCase().includes(q));
    }

    if (liste.length === 0) {
        grid.innerHTML = `<p class="country-empty">Aucun pays trouvé.</p>`;
        return;
    }

    grid.innerHTML = liste.map(p => {
        const selected = currentCountry && currentCountry.code === p.code ? 'selected' : '';
        return `<button class="country-card ${selected}" data-code="${p.code}" data-name="${p.name}" data-continent="${p.continent}">
            <img class="country-flag-img" src="${flagUrl(p.code)}" alt="${p.name}" loading="lazy">
            <span class="country-name">${p.name}</span>
        </button>`;
    }).join('');

    // Événements sur chaque carte
    grid.querySelectorAll('.country-card').forEach(btn => {
        btn.addEventListener('click', () => {
            grid.querySelectorAll('.country-card').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentCountry = {
                code:      btn.dataset.code,
                name:      btn.dataset.name,
                continent: btn.dataset.continent
            };
            document.getElementById('country-confirm-btn').disabled = false;
        });
    });
}

// Onglets continents
document.querySelectorAll('.continent-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.continent-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentContinentFilter = tab.dataset.continent;
        renderCountryGrid(currentContinentFilter, document.getElementById('country-search').value);
    });
});

// Recherche
document.getElementById('country-search').addEventListener('input', (e) => {
    renderCountryGrid(currentContinentFilter, e.target.value);
});

// Confirmer le pays → aller à l'écran avatar
document.getElementById('country-confirm-btn').addEventListener('click', () => {
    if (!currentCountry) return;
    localStorage.setItem('quiz_country_' + currentUser, JSON.stringify(currentCountry));
    document.getElementById('avatar-welcome-msg').textContent =
        `Bienvenue ${currentUser} ! Sélectionnez votre dinosaure`;
    renderAvatarGrid();
    if (currentAvatarId) {
        document.getElementById('avatar-confirm-btn').disabled = false;
    }
    showScreen('avatar-screen');
});

/* -------------------------------------------------------------- */
/* 14. ÉCRAN AVATAR                                                    */
/* -------------------------------------------------------------- */
document.getElementById('avatar-confirm-btn').addEventListener('click', () => {
    if (!currentAvatarId) return;
    localStorage.setItem('quiz_avatar_' + currentUser, currentAvatarId);
    showScreen('menu-screen');
});

/* -------------------------------------------------------------- */
/* 15. ÉCRAN 2 : DOMAINES                                             */
/* -------------------------------------------------------------- */
document.querySelectorAll('.domain-card[data-domain]').forEach(card => {
    card.addEventListener('click', () => {
        currentDomainKey = card.getAttribute('data-domain');
        currentSubKey    = "";

        if (currentDomainKey === 'informatique') {
            showScreen('sub-informatique-screen');
        } else if (currentDomainKey === 'capitales_pays') {
            showScreen('sub-capitales-screen');
        } else if (currentDomainKey === 'langues') {
            showScreen('sub-langues-screen');
        } else {
            afficherEcranNiveau();
        }
    });
});

/* -------------------------------------------------------------- */
/* 16. SOUS-DOMAINES                                                   */
/* -------------------------------------------------------------- */
document.querySelectorAll('.domain-card[data-sub]').forEach(card => {
    card.addEventListener('click', () => {
        currentSubKey = card.getAttribute('data-sub');
        afficherEcranNiveau();
    });
});

/* -------------------------------------------------------------- */
/* 17. ÉCRAN NIVEAU                                                    */
/* -------------------------------------------------------------- */
function afficherEcranNiveau() {
    const nomDom  = NOM_DOMAINES[currentSubKey]  || NOM_DOMAINES[currentDomainKey] || currentDomainKey;
    document.getElementById('level-domain-label').textContent = nomDom;
    showScreen('level-screen');
}

document.querySelectorAll('.level-card').forEach(card => {
    card.addEventListener('click', () => {
        currentNiveau = card.getAttribute('data-level');
        demarrerQuiz(currentDomainKey, currentSubKey || null);
    });
});

document.getElementById('level-back-btn').addEventListener('click', () => {
    if (currentSubKey) {
        if (currentDomainKey === 'informatique') showScreen('sub-informatique-screen');
        else if (currentDomainKey === 'capitales_pays') showScreen('sub-capitales-screen');
        else if (currentDomainKey === 'langues') showScreen('sub-langues-screen');
        else showScreen('menu-screen');
    } else {
        showScreen('menu-screen');
    }
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen('menu-screen'));
});

document.getElementById('quiz-back-btn').addEventListener('click', () => {
    clearInterval(timerID);
    hideFlagImage();
    hideDinoImage();
    showScreen('menu-screen');
});

/* -------------------------------------------------------------- */
/* 18. FISHER-YATES                                                    */
/* -------------------------------------------------------------- */
function melangerTableau(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* -------------------------------------------------------------- */
/* 19. DÉMARRER LE QUIZ                                                */
/* -------------------------------------------------------------- */
function demarrerQuiz(domain, sub = null) {
    let pool = [];

    if (sub) {
        pool = quizData[domain]?.[sub] || [];
    } else {
        const data = quizData[domain];
        pool = Array.isArray(data) ? data : flattenDomain(data);
    }

    if (currentNiveau === 'aléatoire') {
        // tous
    } else if (currentNiveau) {
        pool = pool.filter(q => q.niveau === currentNiveau);
    }

    if (pool.length === 0) {
        alert("Aucune question disponible pour ce niveau dans ce domaine !");
        showScreen('level-screen');
        return;
    }

    activeQuestions      = melangerTableau(pool).slice(0, 20);
    currentQuestionIndex = 0;
    score                = 0;

    const nomAffiche = NOM_DOMAINES[sub] || NOM_DOMAINES[domain] || domain;
    document.getElementById('nom-domaine').textContent = nomAffiche;

    let niveauBadgeEl = document.getElementById('niveau-badge');
    if (!niveauBadgeEl) {
        niveauBadgeEl = document.createElement('span');
        niveauBadgeEl.id = 'niveau-badge';
        const nomDom = document.getElementById('nom-domaine');
        nomDom.insertAdjacentElement('afterend', niveauBadgeEl);
    }
    const classeNiveau = {
        'débutant':      'debutant',
        'intermédiaire': 'intermediaire',
        'avancé':        'avance',
        'aléatoire':     'aleatoire'
    }[currentNiveau] || '';
    const labelNiveau = currentNiveau.charAt(0).toUpperCase() + currentNiveau.slice(1);
    niveauBadgeEl.className   = `niveau-badge ${classeNiveau}`;
    niveauBadgeEl.textContent = labelNiveau;

    showScreen('quiz-screen');
    afficherQuestion();
}

/* -------------------------------------------------------------- */
/* 20. GESTION DE L'IMAGE DU DRAPEAU                                  */
/* -------------------------------------------------------------- */
function showFlagImage(code) {
    let flagContainer = document.getElementById('flag-container');

    if (!flagContainer) {
        flagContainer = document.createElement('div');
        flagContainer.id = 'flag-container';
        flagContainer.className = 'flag-container';

        const img = document.createElement('img');
        img.id = 'flag-img';
        img.alt = 'Drapeau du pays';
        flagContainer.appendChild(img);

        const questionText = document.getElementById('question-text');
        questionText.insertAdjacentElement('afterend', flagContainer);
    }

    const img = document.getElementById('flag-img');
    img.src = `https://flagcdn.com/w160/${code}.png`;
    img.onerror = () => { flagContainer.style.display = 'none'; };
    flagContainer.style.display = 'flex';
}

function hideFlagImage() {
    const flagContainer = document.getElementById('flag-container');
    if (flagContainer) flagContainer.style.display = 'none';
}

/* -------------------------------------------------------------- */
/* 20b. GESTION DE L'IMAGE DINOSAURE (Wikipedia API)              */
/* -------------------------------------------------------------- */

// Correspondance code dino → titre Wikipedia EN pour la vignette
const DINO_WIKI = {
    trex:               'Tyrannosaurus',
    triceratops:        'Triceratops',
    velociraptor:       'Velociraptor',
    stegosaurus:        'Stegosaurus',
    brachiosaurus:      'Brachiosaurus',
    spinosaurus:        'Spinosaurus',
    ankylosaurus:       'Ankylosaurus',
    diplodocus:         'Diplodocus',
    allosaurus:         'Allosaurus',
    parasaurolophus:    'Parasaurolophus',
    iguanodon:          'Iguanodon',
    carnotaurus:        'Carnotaurus',
    giganotosaurus:     'Giganotosaurus',
    apatosaurus:        'Apatosaurus',
    pachycephalosaurus: 'Pachycephalosaurus',
    dilophosaurus:      'Dilophosaurus',
    compsognathus:      'Compsognathus',
    archaeopteryx:      'Archaeopteryx',
    therizinosaurus:    'Therizinosaurus',
    oviraptor:          'Oviraptor',
    argentinosaurus:    'Argentinosaurus',
    baryonyx:           'Baryonyx',
    deinocheirus:       'Deinocheirus',
    gallimimus:         'Gallimimus'
};

// Cache dédié aux images dino (séparé du cache avatars)
const dinoImgCache = {};

async function fetchDinoImage(code) {
    const wikiTitle = DINO_WIKI[code];
    if (!wikiTitle) return null;
    if (dinoImgCache[code]) return dinoImgCache[code];
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&format=json&pithumbsize=400&origin=*`;
        const resp = await fetch(url);
        const data = await resp.json();
        const pages = data.query.pages;
        const page  = Object.values(pages)[0];
        if (page.thumbnail && page.thumbnail.source) {
            dinoImgCache[code] = page.thumbnail.source;
            return page.thumbnail.source;
        }
    } catch (e) { /* silencieux */ }
    return null;
}

async function showDinoImage(code) {
    let dinoContainer = document.getElementById('dino-container');

    if (!dinoContainer) {
        dinoContainer = document.createElement('div');
        dinoContainer.id = 'dino-container';
        dinoContainer.className = 'dino-container';

        const img = document.createElement('img');
        img.id  = 'dino-img';
        img.alt = 'Dinosaure';
        dinoContainer.appendChild(img);

        const questionText = document.getElementById('question-text');
        questionText.insertAdjacentElement('afterend', dinoContainer);
    }

    dinoContainer.style.display = 'flex';

    const img = document.getElementById('dino-img');
    // Affiche un placeholder pendant le chargement
    img.src = '';
    img.classList.add('dino-loading');

    const src = await fetchDinoImage(code);
    if (src) {
        img.onload  = () => img.classList.remove('dino-loading');
        img.onerror = () => { dinoContainer.style.display = 'none'; };
        img.src = src;
    } else {
        dinoContainer.style.display = 'none';
    }
}

function hideDinoImage() {
    const dinoContainer = document.getElementById('dino-container');
    if (dinoContainer) dinoContainer.style.display = 'none';
}

/* -------------------------------------------------------------- */
/* 21. AFFICHER UNE QUESTION                                           */
/* -------------------------------------------------------------- */
function afficherQuestion() {
    if (currentQuestionIndex >= activeQuestions.length) {
        afficherResultats();
        return;
    }

    aRepondu = false;
    const q  = activeQuestions[currentQuestionIndex];

    document.getElementById('question-text').textContent = q.question;
    document.getElementById('question-counter').textContent =
        `Question ${currentQuestionIndex + 1} / ${activeQuestions.length}`;

    document.getElementById('score-live').textContent = `Score : ${score}`;

    const pct  = ((currentQuestionIndex + 1) / activeQuestions.length) * 100;
    const fill = document.getElementById('progress-fill');
    fill.style.transition = 'none';
    fill.style.width = pct + '%';

    if (currentDomainKey === 'dinosaures' && q.isDinoImg && q.code && q.code.trim() !== "") {
        hideFlagImage();
        showDinoImage(q.code.trim());
    } else if (q.code && q.code.trim() !== "" && currentDomainKey !== 'dinosaures') {
        hideDinoImage();
        showFlagImage(q.code.trim());
    } else {
        hideFlagImage();
        hideDinoImage();
    }

    const ordreOptions = melangerTableau([0, 1, 2, 3]);
    ordreOptions.forEach((indexOriginal, position) => {
        const btn   = document.getElementById('opt' + position);
        const texte = document.getElementById('texte-opt' + position);
        texte.textContent            = q.options[indexOriginal];
        btn.dataset.indexOriginal    = indexOriginal;
        btn.className                = 'option-btn';
        btn.disabled                 = false;
    });

    const feedback = document.getElementById('feedback');
    feedback.className   = 'feedback cache';
    feedback.textContent = '';

    const btnSuivant = document.getElementById('btn-suivant');
    btnSuivant.className   = 'btn-suivant cache';
    btnSuivant.textContent =
        currentQuestionIndex < activeQuestions.length - 1
            ? 'Question suivante →'
            : 'Voir les résultats →';

    demarrerTimer();
}

/* -------------------------------------------------------------- */
/* 22. TIMER                                                           */
/* -------------------------------------------------------------- */
function demarrerTimer() {
    clearInterval(timerID);
    tempsRestant = 20;
    mettreAJourTimer();

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const fill = document.getElementById('progress-fill');
        fill.style.transition = 'width 20s linear';
        fill.style.width = '0%';
    }));

    timerID = setInterval(() => {
        tempsRestant--;
        mettreAJourTimer();
        if (tempsRestant <= 0) {
            clearInterval(timerID);
            if (!aRepondu) choisirReponse(-1);
        }
    }, 1000);
}

function mettreAJourTimer() {
    const el = document.getElementById('timer');
    el.innerHTML = `<span class="material-symbols-outlined">timer</span> ${tempsRestant} s`;
    el.className = tempsRestant <= 5 ? 'timer urgent' : 'timer';
}

/* -------------------------------------------------------------- */
/* 23. CHOISIR UNE RÉPONSE                                            */
/* -------------------------------------------------------------- */
window.choisirReponse = function(positionChoisie) {
    if (aRepondu) return;
    aRepondu = true;
    clearInterval(timerID);

    const q       = activeQuestions[currentQuestionIndex];
    const boutons = document.querySelectorAll('.option-btn');
    let positionCorrecte = -1;

    boutons.forEach((btn, pos) => {
        btn.disabled = true;
        if (parseInt(btn.dataset.indexOriginal) === q.reponse) {
            positionCorrecte = pos;
        }
    });

    const feedback = document.getElementById('feedback');

    if (positionChoisie === -1) {
        // ⏱️ Temps écoulé — personne n'a répondu
        if (positionCorrecte !== -1) boutons[positionCorrecte].classList.add('manque');
        feedback.className = 'feedback timeout';
        feedback.innerHTML =
            `<span class="material-symbols-outlined">timer</span>
             <span>Temps écoulé ! ${q.explication}</span>`;

        // Enregistrement Firebase : timeout
        CloudScore.pushReponse(
            currentDomainKey, currentSubKey, currentNiveau,
            q.question, q.options, q.reponse,
            -1, "timeout"
        );

    } else if (parseInt(boutons[positionChoisie].dataset.indexOriginal) === q.reponse) {
        // ✅ Bonne réponse
        boutons[positionChoisie].classList.add('correct');
        score++;
        document.getElementById('score-live').textContent = `Score : ${score}`;
        feedback.className = 'feedback correct';
        feedback.innerHTML =
            `<span class="material-symbols-outlined">check_circle</span>
             <span>Bonne réponse ! ${q.explication}</span>`;

        // Enregistrement Firebase : correct
        CloudScore.pushReponse(
            currentDomainKey, currentSubKey, currentNiveau,
            q.question, q.options, q.reponse,
            parseInt(boutons[positionChoisie].dataset.indexOriginal), "correct"
        );

    } else {
        // ❌ Mauvaise réponse
        boutons[positionChoisie].classList.add('incorrect');
        if (positionCorrecte !== -1) boutons[positionCorrecte].classList.add('manque');
        feedback.className = 'feedback incorrect';
        feedback.innerHTML =
            `<span class="material-symbols-outlined">cancel</span>
             <span>Mauvaise réponse. ${q.explication}</span>`;

        // Enregistrement Firebase : incorrect + option choisie
        CloudScore.pushReponse(
            currentDomainKey, currentSubKey, currentNiveau,
            q.question, q.options, q.reponse,
            parseInt(boutons[positionChoisie].dataset.indexOriginal), "incorrect"
        );
    }

    document.getElementById('btn-suivant').className = 'btn-suivant';
};

/* -------------------------------------------------------------- */
/* 24. QUESTION SUIVANTE                                               */
/* -------------------------------------------------------------- */
window.questionSuivante = function() {
    currentQuestionIndex++;
    afficherQuestion();
};

/* -------------------------------------------------------------- */
/* 25. AFFICHER LES RÉSULTATS + CLASSEMENT FIRESTORE                  */
/* -------------------------------------------------------------- */
let scoreboardData  = [];
let tsJoueurGlobal  = 0;

async function afficherResultats() {
    hideFlagImage();
    hideDinoImage();

    const total       = activeQuestions.length;
    const pourcentage = Math.round((score / total) * 100);

    document.querySelector('.score-cercle').style.setProperty('--pct', pourcentage + '%');
    document.getElementById('score-pourcentage').textContent = pourcentage + '%';
    document.getElementById('stat-bonnes').textContent       = score;
    document.getElementById('stat-mauvaises').textContent    = total - score;
    document.getElementById('stat-total').textContent        = total;

    let icone, message;
    if (pourcentage < 40) {
        icone = 'sentiment_dissatisfied';
        message = 'À revoir... Ne baisse pas les bras !';
    } else if (pourcentage < 70) {
        icone = 'sentiment_neutral';
        message = 'Pas mal ! Tu peux faire encore mieux !';
    } else if (pourcentage < 90) {
        icone = 'sentiment_satisfied';
        message = 'Très bien ! Tu maîtrises bien le sujet !';
    } else {
        icone = 'sentiment_very_satisfied';
        message = 'Excellent ! Tu es un expert !';
    }

    document.getElementById('message-resultat').innerHTML =
        `<span class="material-symbols-outlined">${icone}</span> ${message}`;

    showScreen('score-screen');

    const nomDomaine = NOM_DOMAINES[currentDomainKey] || currentDomainKey;
    const nomSous    = currentSubKey ? (NOM_DOMAINES[currentSubKey] || currentSubKey) : null;
    const titreClas  = nomSous ? `${nomDomaine} — ${nomSous}` : nomDomaine;
    document.querySelector(".scoreboard-container h3").innerHTML =
        `<span class="material-symbols-outlined">leaderboard</span> Classement · ${titreClas}`;

    const list = document.getElementById('scoreboard-list');
    list.innerHTML = `<li style="justify-content:center;color:var(--text-muted);">
        <span>Synchronisation du classement…</span>
    </li>`;

    const tsJoueur = Date.now();
    const entry = {
        name:        currentUser,
        score,
        total,
        pct:         pourcentage,
        ts:          tsJoueur,
        niveau:      currentNiveau,
        countryCode: currentCountry ? currentCountry.code : "",
        countryName: currentCountry ? currentCountry.name : ""
    };
    await CloudScore.push(currentDomainKey, currentSubKey, entry);

    const tousLesScores = await CloudScore.load(currentDomainKey, currentSubKey);
    scoreboardData = tousLesScores;
    tsJoueurGlobal = tsJoueur;

    if (scoreboardData.length === 0) {
        list.innerHTML = `<li style="justify-content:center;color:var(--text-muted);border:none;background:none;">
            <span>Aucun score enregistré pour l'instant.</span>
        </li>`;
        return;
    }

    afficherOngletClassement(currentNiveau);
}

/* -------------------------------------------------------------- */
/* 26. AFFICHER UN ONGLET DU CLASSEMENT                               */
/* -------------------------------------------------------------- */
function afficherOngletClassement(filtre) {

    document.querySelectorAll('.sb-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filtre === filtre);
    });

    const list = document.getElementById('scoreboard-list');

    let donnees;
    if (filtre === 'tous') {
        donnees = scoreboardData;
    } else {
        donnees = scoreboardData.filter(e => (e.niveau || '') === filtre);
    }

    donnees = donnees.slice(0, 10);

    if (donnees.length === 0) {
        list.innerHTML = `<li style="justify-content:center;color:var(--text-muted);border:none;background:none;">
            <span>Aucun score pour ce filtre.</span>
        </li>`;
        return;
    }

    const niveauClasse = {
        'débutant':      'debutant',
        'intermédiaire': 'intermediaire',
        'avancé':        'avance',
        'aléatoire':     'aleatoire'
    };
    const niveauLabel = {
        'débutant':      'Débutant',
        'intermédiaire': 'Intermédiaire',
        'avancé':        'Avancé',
        'aléatoire':     'Aléatoire'
    };

    list.innerHTML = donnees.map((e, i) => {
        const estMoi = e.ts === tsJoueurGlobal;

        let badgeClass, badgeLabel, badgeIcon;
        if      (i === 0) { badgeClass = 'gold';   badgeLabel = '1er';       badgeIcon = 'military_tech'; }
        else if (i === 1) { badgeClass = 'silver'; badgeLabel = '2ème';      badgeIcon = 'workspace_premium'; }
        else if (i === 2) { badgeClass = 'bronze'; badgeLabel = '3ème';      badgeIcon = 'grade'; }
        else              { badgeClass = 'other';  badgeLabel = `${i + 1}`;  badgeIcon = 'tag'; }

        const badgeHtml = `<span class="rank-badge ${badgeClass}"><span class="material-symbols-outlined">${badgeIcon}</span>${badgeLabel}</span>`;

        const pctNum   = parseInt(e.pct) || 0;
        const pctColor = pctNum >= 70 ? 'var(--success)' : pctNum >= 40 ? 'var(--warning)' : 'var(--error)';

        const dateStr  = e.dateHeure || '';
        const moiTag   = estMoi ? '<span class="moi-tag">Vous</span>' : '';

        // Drapeau du pays depuis localStorage
        const savedCountryRaw = localStorage.getItem('quiz_country_' + e.name);
        const flagHtml = savedCountryRaw
            ? (() => { try { const c = JSON.parse(savedCountryRaw); return `<img class="sb-flag-img" src="${flagUrl(c.code)}" alt="${c.name}" title="${c.name}">`; } catch { return ''; } })()
            : '';

        const niv     = e.niveau || '';
        const nivCls  = niveauClasse[niv] || '';
        const nivLbl  = niveauLabel[niv]  || niv;
        const niveauHtml = (filtre === 'tous' && niv)
            ? `<span class="niveau-badge ${nivCls}" style="font-size:10px;padding:2px 8px;">${nivLbl}</span>`
            : '';

        // ✅ CORRIGÉ : utilise getAvatarImg avec une image
        const avatarId  = localStorage.getItem('quiz_avatar_' + e.name) || AVATARS[i % AVATARS.length].id;
        const avatarImg = getAvatarImg(avatarId);
        const avatarHtml = `<div class="sb-avatar"><img src="${avatarImg}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/></div>`;

        return `<li class="${estMoi ? 'moi' : ''}">
            <div class="sb-top">
                <div class="sb-left">
                    ${badgeHtml}
                    ${avatarHtml}
                    <span class="sb-name">${e.name}${moiTag}</span>
                    ${flagHtml}
                    ${niveauHtml}
                </div>
                <span class="sb-score" style="color:${pctColor}">${e.score}/${e.total} · ${e.pct}%</span>
            </div>
            ${dateStr ? `<div class="sb-date"><span class="material-symbols-outlined">schedule</span>${dateStr}</div>` : ''}
        </li>`;
    }).join('');
}

/* -------------------------------------------------------------- */
/* 27. ONGLETS DU CLASSEMENT                                           */
/* -------------------------------------------------------------- */
document.querySelectorAll('.sb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        afficherOngletClassement(btn.dataset.filtre);
    });
});

/* -------------------------------------------------------------- */
/* 28. BOUTONS FIN DE PARTIE                                           */
/* -------------------------------------------------------------- */
document.getElementById('restart-btn').addEventListener('click', () => {
    afficherEcranNiveau();
});

document.getElementById('home-btn').addEventListener('click', () => {
    showScreen('menu-screen');
});

/* -------------------------------------------------------------- */
/* 29. DÉMARRAGE                                                       */
/* -------------------------------------------------------------- */
showScreen('login-screen');