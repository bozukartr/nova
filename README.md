# NOVA · Kritik Kütle

Tek telefonda, sırayla oynanan zincirleme patlama oyunu. Çekirdekleri hücrelere
yığarsın, hücre taşıma sınırına ulaşınca **nova** olur ve çekirdeklerini dört
komşuya savurur — savrulan her çekirdek komşuyu senin rengine çevirir. Bir
dokunuş bütün tahtayı deviren zincire dönüşebilir. Rakibin son çekirdeğini
yutan turu alır, seriyi alan maçı.

Bağımlılık yok, derleme adımı zorunlu değil: `dist/index.html` tek başına
(çevrimdışı, `file://` üzerinden bile) çalışır.

```
npm test        # kural motoru + AI testleri
npm run dev     # http://localhost:5173 — kaynak sürüm (ES modülleri)
npm run build   # dist/index.html üretir (tek dosya, satır içi CSS + JS)
npm run check   # test + derleme
```

## Oyun

| | |
|---|---|
| **Taşıma sınırı** | köşe 2 · kenar 3 · orta 4 (boş hücrelerde soluk yazar) |
| **Hamle** | boş bir hücre ya da kendi rengindeki bir hücre |
| **Tur** | rakibin son çekirdeği yutulunca biter |
| **Maç** | TEK / İLK 3 / İLK 5 |
| **Tahta** | 5×4 · 6×5 · 8×6 |
| **Rakip** | 2 oyuncu · KOLAY · NORMAL · ZOR |

### Menü

Ana menü dört girişten oluşur: **OYNA 2P**, **OYNA AI** (zorluk ekranı),
**ÖĞREN** (görsel kural kartları) ve **AYARLAR** (tahta, seri, ses, titreşim,
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
tests/              node:test ile çalışan kural ve AI testleri
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
