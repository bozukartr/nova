/* NOVA · Firebase projesi
 *
 * Buradaki anahtarlar gizli değil: Firebase web anahtarı bir kimlik, bir sır
 * değil — istemciye zaten açık gider. Güvenlik tamamen Firestore kurallarından
 * gelir; depodaki firestore.rules dosyasını dağıtmadan odalar herkese açıktır.
 *
 * Oyun bu projeye yalnız çevrimiçi oda için bağlanır. Tek telefon ve AI modları
 * ağa hiç çıkmaz.
 */

export const FIREBASE = {
  apiKey: 'AIzaSyAsB1hZ6aZkuNv_xVCukJSPY-OTrC4tlmg',
  authDomain: 'nov4star.firebaseapp.com',
  projectId: 'nov4star',
  storageBucket: 'nov4star.firebasestorage.app',
  messagingSenderId: '487186941239',
  appId: '1:487186941239:web:951647f83169d032e106b2',
  measurementId: 'G-Y23N5MWLB7'
};

/** Odanın kaç saat sonra ölü sayılacağı (Firestore TTL ile temizlenir). */
export const ROOM_TTL_HOURS = 6;
