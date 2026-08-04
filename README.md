# NOVA · Kritik Kütle

Tek telefonda, sırayla oynanan zincirleme patlama oyunu. Çekirdekleri hücrelere
yığarsın, hücre taşıma sınırına ulaşınca **nova** olur ve çekirdeklerini dört
komşuya savurur — savrulan her çekirdek komşuyu senin rengine çevirir. Bir
dokunuş bütün tahtayı deviren zincire dönüşebilir. Rakibin son çekirdeğini
yutan turu alır, seriyi alan maçı.

Bağımlılık yok, derleme adımı zorunlu değil: `dist/index.html` tek başına
(çevrimdışı, `file://` üzerinden bile) çalışır.

```
npm test        # kural motoru, AI ve oda protokolü testleri
npm run dev     # http://localhost:5173 — kaynak sürüm (ES modülleri)
npm run build   # dist/index.html üretir (tek dosya, satır içi CSS + JS)
npm run check   # test + derleme
npm run net:check    # canlı Firebase odasına uçtan uca denetim (ağ ister)
npm run net:latency  # hamlenin karşı ekranda görünme süresini ölçer (ağ ister)
```

## Oyun

| | |
|---|---|
| **Taşıma sınırı** | köşe 2 · kenar 3 · orta 4 (boş hücrelerde soluk yazar) |
| **Hamle** | boş bir hücre ya da kendi rengindeki bir hücre |
| **Tur** | rakibin son çekirdeği yutulunca biter |
| **Maç** | TEK / İLK 3 / İLK 5 |
| **Tahta** | 5×4 · 6×5 · 8×6 |
| **Rakip** | 2 oyuncu · KOLAY · NORMAL · ZOR · online |

### Menü

Ana menü beş girişten oluşur: **OYNA 2P**, **OYNA AI** (zorluk ekranı),
**OYNA ONLINE** (oda kur / kodla katıl), **ÖĞREN** (görsel kural kartları) ve
**AYARLAR** (tahta, seri, ses, titreşim,
istatistik sıfırlama). Oyun içindeyken alt konsoldaki ≡ düğmesi aynı menüyü
duraklatma ekranı olarak açar; üstte **DEVAM ET**, tur bittiyse **SONRAKİ TUR**
görünür. Menü canlı sahnenin üzerine yarı saydam perdeyle biner.

Masaüstünde klavye de çalışır (menüde tanıtılmaz): `← ↑ → ↓` gez ·
`boşluk` bırak · `Z` geri al · `R` yeni tur · `M` ses · `Esc` menü ·
`F` kare sayacı (`?fps=1` ile de açılır).

## Yapı

```
index.html          geliştirme girişi (ES modüllerini yükler)
src/
  config.js         sabitler: taraflar, tahta/seri/zorluk tanımları
  engine.js         kural motoru — saf, DOM'suz, test edilebilir
  ai.js             negamax + alfa-beta, zaman bütçeli iteratif derinleşme
  room.js           çevrimiçi oda protokolü — saf mantık + Firestore kodlaması
  net.js            anonim giriş ve oda belgesi (Firebase REST, SDK yok)
  firebase-config.js  proje anahtarları (gizli değil, bkz. firestore.rules)
  game.js           sıra akışı, animasyonlu zincir, geri alma, girdi
  renderer.js       canvas çizimi, parçacıklar, kamera
  sprites.js        ön-render sprite atlası
  background.js     WebGL bulutsu arka planı
  audio.js          WebAudio ile sentezlenen sesler (ses dosyası yok)
  hud.js            DOM tarafının tamamı: HUD, menü panelleri, kazanma kartı
  anim.js           minik tween motoru
  storage.js        ayar kalıcılığı (localStorage, geri düşüşlü)
  main.js           açılış, ana döngü, uyarlanabilir kalite
tools/
  build.mjs         modülleri tek IIFE'ye derler, CSS'i satır içine alır
  serve.mjs         bağımlılıksız statik sunucu
  net-check.mjs     canlı odaya uçtan uca denetim (ağ ister)
  net-latency.mjs   hamle gecikmesi ölçümü (ağ ister)
tests/              node:test ile çalışan kural, AI ve oda testleri
firestore.rules     oda güvenlik kuralları (dağıtılması gerekir)
dist/index.html     derlenmiş tek dosya sürüm
```

### Tek kural kaynağı

Patlama kuralları yalnızca `engine.js` içinde tanımlıdır. Ekrandaki oyun aynı
ilkelleri (`criticalCells` → `detonate` → `scatter`) araya animasyon koyarak,
AI ise `resolve` ile senkron çalıştırır. Kural tek yerde olduğu için AI'nin
gördüğü tahta ile oyuncunun gördüğü tahta ayrışamaz.

### Zincir iptali

Animasyonlu zincir `await` ile ilerlediği için tur ortasında sıfırlanabilir.
Her tur bir `epoch` numarasıyla damgalanır; yeni tur, geri alma ya da ayar
değişikliği numarayı artırır ve yarıda kalan zincir bir sonraki beklemede
sessizce çekilir.

### Çevrimiçi oda

Bir oyuncu **ODA KUR** der, dört haneli kod alır; ikinci oyuncu kodu tuş
takımına girip katılır ve oyun kendiliğinden başlar. Kimlik doğrulama anonim:
kimse hesap açmaz, tarayıcıda saklanan anonim kimlik sayfa yenilense de aynı
oyuncuyu işaret eder.

**Odada tahta durumu tutulmaz — yalnız hamle listesi taşınır.** Kural motoru
saf ve deterministik olduğu için iki istemci aynı listeden bit bit aynı tahtayı
üretir; "senkron" diye ayrı bir sorun kalmaz ve bir tur baştan oynatılabilir.
Kendi hamlen anında oynanır ve aynı anda gönderilir; sunucu reddederse tur
odadaki listeden yeniden kurulur.

Firebase JS SDK yerine düz REST kullanılıyor. Böylece oyun sıfır bağımlılıkta
kalıyor, tek dosya sürümü hâlâ tek dosya ve yerel modlar ağa hiç çıkmıyor.
Her yazma son okunan belgenin `updateTime` damgasını koşul olarak gönderir
(`currentDocument.updateTime`), yani iki istemci aynı anda yazmaya kalkarsa biri
reddedilir ve tazeleyip yeniden dener — kayıp güncelleme olmaz.

#### Gecikme ve yoklama temposu

REST'in canlı dinleyicisi olmadığı için oda yoklanıyor; tempo sabit değil, son
değişiklikten bu yana geçen süreye göre seyreliyor (`POLL_PLAN`):

| son değişiklikten beri | yoklama arası |
|---|---|
| 0 – 0,8 sn | 450 ms — rakip hamlemi daha yeni görüyor |
| 0,8 – 9 sn | **260 ms** — cevabın en olası olduğu pencere |
| 9 – 30 sn | 700 ms |
| 30 – 90 sn | 1,5 sn |
| 90 sn + | 3 sn |

Sıra bendeyken 2,5 sn (yalnız rakibin kopmasını gözlüyoruz), sekme arka
plandayken hiç. Kritik ayrıntı: **kendi yazımdan hemen sonra tempo sıfırlanıyor.**
Bu yapılmadığında, hamlemi gönderdikten sonra "sıra bende" döneminden kalan
seyrek zamanlayıcı devrede kalıyor ve rakibin cevabı 2–3 saniye geç görünüyordu.

`npm run net:latency` bunu gerçek projede ölçer. Aynı ölçüm iyi bağlantılı bir
makinede (RTT ≈ 0):

| | ortalama | en iyi | en kötü |
|---|---|---|---|
| tempo düzeltmesinden önce | 900 ms | 501 ms | 1123 ms |
| sonra | **396 ms** | 159 ms | 612 ms |

Kalan sürenin neredeyse tamamı iki gidiş-dönüş: gönderenin yazması ve alıcının
okuması. Telefonda şebeke gecikmesi de eklenir. Yoklamayla bunun altına inmek
mümkün değil; daha aşağısı için gerçek anlamda **push** gerekir — Realtime
Database'in REST akışı (`Accept: text/event-stream`) bunu SDK'sız verir ve
gecikmeyi tek gidiş-dönüşe indirir. Bu depoda yok: proje şu an yalnız Firestore
kullanıyor.

Maliyet: rakip düşünürken saniyede ~4 okuma. Uzun bir maç iki oyuncu için birkaç
yüz okuma demek; Firestore'un günlük 50 000 okumalık ücretsiz kotası sıradan
kullanımda fazlasıyla yetiyor.

Odalar `rooms/{kod}` belgesinde tutulur; kod belge kimliği olduğu için aynı kodu
iki kişinin alması mümkün değil (çakışan oluşturma isteği atomik olarak reddedilir).

#### Firebase kurulumu

Proje `nov4star`. `src/firebase-config.js` içindeki anahtarlar gizli değildir;
Firebase web anahtarı bir kimliktir, sır değil. Güvenlik tümüyle kurallardan gelir:

1. **Authentication → Sign-in method → Anonymous** açık olmalı (açık).
2. **Firestore** oluşturulmuş olmalı (oluşturulmuş).
3. `firebase deploy --only firestore:rules` ile bu depodaki `firestore.rules`
   dağıtılmalı. **Dağıtılmadığı sürece odalar herkese açıktır** — bu depo
   hazırlanırken proje hâlâ test kurallarındaydı, yani `rooms` koleksiyonu
   kimlik doğrulamasız okunabiliyordu.
4. İsteğe bağlı: `rooms` koleksiyonunda `expiresAt` alanına **TTL** tanımlayarak
   terk edilmiş odaları Firebase'in kendiliğinden silmesini sağlayın
   (oyun bu alanı zaten yazıyor, varsayılan 6 saat).

`npm run net:check` gerçek projeye bağlanıp iki oyuncu simüle eder: anonim giriş,
oda kurma, katılma, hamle alışverişi, eski sayaçla gelen hamlenin reddi, dolu
odaya üçüncü oyuncunun alınmaması, tur ilerletme, rövanş ve odanın kapanması.
Denetim açtığı odayı siler.

Dört haneli kod 9 000 ihtimal demek: bir başkasının kodunu deneyerek odana
düşmesi teorik olarak mümkün. Sohbet niteliğinde bir oyun için kabul edilebilir;
kritik bir şey saklanmıyor.

### Uyarlanabilir kalite

Ana döngü FPS yerine **kare başına gerçek iş süresini** ölçer: 120 Hz ekranda
FPS yüksek görünürken bütçenin iki katının harcandığını ancak bu yakalar.
Üç kademe arasında iki yönlü geçiş yapılır (parçacık yoğunluğu, sarsıntı, DPR
tavanı), böylece anlık bir takılma kaliteyi kalıcı olarak düşürmez.
`prefers-reduced-motion` açıksa efektler baştan kısılır ve titreşim kapanır.

## Prototipten farklar

Bu depo tek dosyalık bir prototipten geliştirildi. Belli başlı değişiklikler:

- **CDN bağımlılığı kaldırıldı.** Animasyonlar için çekilen GSAP'ın yerini
  ~60 satırlık `anim.js` aldı; ağ olmadan da bütün animasyonlar çalışıyor.
  (Yazı tipleri hâlâ Google Fonts'tan gelir ama yalnızca süstür: ağ yoksa
  sistem yazı tipine düşer, oyun etkilenmez.)
- **Kural kopyası ayıklandı.** Prototipte patlama mantığı biri ekran biri AI
  için olmak üzere iki kez yazılmıştı; artık tek motor var ve test ediliyor.
- **AI güçlendirildi.** Sabit derinlik yerine zaman bütçeli iteratif derinleşme,
  hamle sıralaması ve düzeltilmiş değerlendirme. (Prototipteki değerlendirme,
  rakip henüz hiç oynamamışken açılış hamlesini "kazandım" sanabiliyordu.)
- **Menü baştan tasarlandı.** Prototipte açılış ekranı bir duvar dolusu kural
  metni + dört segment kontrolüydü; yerine dört girişli ana menü ve ayrı ekranlar
  geldi (zorluk, görsel kural kartları, ayarlar). Oyun içinde aynı menü duraklatma
  ekranı olarak açılıyor.
- **Geri alma** eklendi; AI'ya karşı oynarken rakibin cevabıyla birlikte geri alır.
- **Tahta ve seri seçenekleri** eklendi, ayarlar ve maç istatistikleri saklanıyor.
- **Klavye ve ekran okuyucu desteği**: imleçle gezinme, `aria-live` ile sıra ve
  sonuç bildirimi.
- **Sekme arka plandayken döngü duruyor** (pil ve gereksiz iş).
- **Testler ve CI**: kural motoru ve AI için `node:test`, her itmede test +
  derleme doğrulaması.

## Lisans

MIT
