// ─── Firebase Config (hardcoded) ────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDEcnBzi_ZjtUlN2Lg6pe_cOsIinixt4F4",
  authDomain: "xlgr2-766c1.firebaseapp.com",
  projectId: "xlgr2-766c1",
  storageBucket: "xlgr2-766c1.appspot.com",
  messagingSenderId: "707659644229",
  appId: "1:707659644229:web:842ce1a1924c87058cd22c"
};

// ─── APP Object ─────────────────────────────────────────────────────────────
const APP = {
  _db: null,
  _initDone: false,

  async initFirebase() {
    if (this._db && this._initDone) return this._db;
    this._initDone = true;
    
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK not loaded');
      return null;
    }
    
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this._db = firebase.firestore();
      
      // Enable offline persistence
      this._db.enablePersistence({ synchronizeTabs: true })
        .catch(e => console.log('Persistence error:', e));
        
      console.log('Firebase connected successfully');
      return this._db;
    } catch(e) {
      console.error('Firebase init error:', e);
      this._db = null;
      return null;
    }
  },

  async _get(key) {
    const db = await this.initFirebase();
    if (!db) {
      // Fallback to localStorage
      const v = localStorage.getItem('fk_' + key);
      return v ? JSON.parse(v) : null;
    }
    try {
      const doc = await db.collection('store').doc(key).get();
      if (doc.exists) {
        // Update local cache
        localStorage.setItem('fk_' + key, JSON.stringify(doc.data().value));
        return doc.data().value;
      }
    } catch(e) {
      console.error('Firestore get error:', e);
    }
    // Fallback
    const v = localStorage.getItem('fk_' + key);
    return v ? JSON.parse(v) : null;
  },

  async _set(key, value) {
    const db = await this.initFirebase();
    // Always save to localStorage as backup
    localStorage.setItem('fk_' + key, JSON.stringify(value));
    
    if (!db) {
      console.log('Saved to localStorage only (Firebase not connected)');
      return { localSaved: true, remoteSaved: false, reason: 'firebase_not_connected' };
    }
    
    try {
      await db.collection('store').doc(key).set({ value });
      console.log('Saved to Firebase + localStorage');
      return { localSaved: true, remoteSaved: true };
    } catch(e) {
      console.error('Firestore set error:', e);
      return { localSaved: true, remoteSaved: false, reason: e && e.message ? e.message : String(e) };
    }
  },

  _local(key) {
    try { 
      const v = localStorage.getItem('fk_' + key); 
      return v ? JSON.parse(v) : null; 
    } catch(e) { return null; }
  },

  // ── Products ──────────────────────────────────────────────────────────────
  async getProductsAsync() {
    const remote = await this._get('products');
    if (remote) return remote;
    return this._local('products') || [];
  },

  getProducts() {
    return this._local('products') || [];
  },

  async saveProducts(products) {
    return await this._set('products', products);
  },

  // ── UPI ───────────────────────────────────────────────────────────────────
  async getUpiAsync() {
    const remote = await this._get('upi');
    if (remote) return remote;
    return this._local('upi') || { upiId: '', name: 'Store', note: 'Order Payment' };
  },

  getUpi() {
    return this._local('upi') || { upiId: '', name: 'Store', note: 'Order Payment' };
  },

  async saveUpi(config) {
    return await this._set('upi', config);
  },

  // ── Banners ───────────────────────────────────────────────────────────────
  async getBannersAsync() {
    const db = await this.initFirebase();
    if (!db) return this._local('banners') || [];

    try {
      const snap = await db.collection('store_banners').orderBy('idx').get();
      if (!snap.empty) {
        const list = snap.docs
          .map(d => d.data().value)
          .filter(v => typeof v === 'string' && v.trim());
        localStorage.setItem('fk_banners', JSON.stringify(list));
        return list;
      }
    } catch (e) {
      console.error('Firestore get banners error:', e);
    }

    const legacy = await this._get('banners');
    if (legacy && Array.isArray(legacy) && legacy.length) return legacy;
    return this._local('banners') || [];
  },

  getBanners() {
    return this._local('banners') || [];
  },

  async saveBanners(banners) {
    const list = (banners || []).filter(v => typeof v === 'string' && v.trim());
    localStorage.setItem('fk_banners', JSON.stringify(list));

    const db = await this.initFirebase();
    if (!db) {
      return { localSaved: true, remoteSaved: false, reason: 'firebase_not_connected' };
    }

    try {
      const col = db.collection('store_banners');
      const old = await col.get();
      const batch = db.batch();

      old.forEach(doc => batch.delete(doc.ref));
      list.forEach((value, idx) => {
        const ref = col.doc('b_' + String(idx).padStart(3, '0'));
        batch.set(ref, { idx, value, updatedAt: Date.now() });
      });

      await batch.commit();
      await db.collection('store').doc('banners').delete().catch(() => {});
      return { localSaved: true, remoteSaved: true, count: list.length };
    } catch (e) {
      console.error('Firestore save banners error:', e);
      return { localSaved: true, remoteSaved: false, reason: e && e.message ? e.message : String(e) };
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────────
  async _fetchPublicIp() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return 'unknown';
      const data = await res.json();
      return data && data.ip ? String(data.ip) : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  },

  async recordVisit() {
    const db = await this.initFirebase();
    if (!db) return { saved: false, reason: 'firebase_not_connected' };

    const sessionKey = 'fk_visit_logged_session';
    if (sessionStorage.getItem(sessionKey) === '1') {
      return { saved: false, reason: 'already_logged_this_session' };
    }

    const ip = await this._fetchPublicIp();
    const payload = {
      ip,
      ua: navigator.userAgent || '',
      path: location.pathname || '',
      ts: Date.now()
    };

    try {
      await db.collection('store_visits').add(payload);
      sessionStorage.setItem(sessionKey, '1');
      return { saved: true, ip };
    } catch (e) {
      return { saved: false, reason: e && e.message ? e.message : String(e) };
    }
  },

  async getVisitStats(limitCount = 5000) {
    const db = await this.initFirebase();
    if (!db) return { total: 0, uniqueIps: 0, repeatVisits: 0, topIps: [] };

    try {
      const snap = await db.collection('store_visits').orderBy('ts', 'desc').limit(limitCount).get();
      const ipCount = {};
      snap.forEach(doc => {
        const d = doc.data() || {};
        const ip = (d.ip && String(d.ip).trim()) ? String(d.ip).trim() : 'unknown';
        ipCount[ip] = (ipCount[ip] || 0) + 1;
      });
      const ips = Object.keys(ipCount);
      const total = snap.size;
      const uniqueIps = ips.length;
      const repeatVisits = Math.max(total - uniqueIps, 0);
      const topIps = ips
        .sort((a, b) => ipCount[b] - ipCount[a])
        .slice(0, 8)
        .map(ip => ({ ip, count: ipCount[ip] }));

      return { total, uniqueIps, repeatVisits, topIps };
    } catch (e) {
      console.error('Visit stats error:', e);
      return { total: 0, uniqueIps: 0, repeatVisits: 0, topIps: [] };
    }
  },

  getProductById(id) { return this.getProducts().find(p => p.id === id) || null; },
  async getProductByIdAsync(id) { const all = await this.getProductsAsync(); return all.find(p => p.id === id) || null; },
  getOffPercent(price, mrp) { return (mrp > price) ? Math.round(((mrp - price) / mrp) * 100) : 0; },
  generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
};
