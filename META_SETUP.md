# Meta (Facebook/Instagram) Entegrasyonu Kurulum Rehberi

Bu rehber, Facebook Page ve Instagram Business mesajlarını Conversa'ya bağlamak için gerekli adımları açıklar.

## Gereksinimler

1. **Meta Developer Hesabı**: [developers.facebook.com](https://developers.facebook.com) üzerinden oluşturulmalı
2. **Facebook Page**: Mesajlaşma için bir Facebook sayfası
3. **Instagram Business Account**: Instagram mesajları için (opsiyonel)
4. **Webhook URL**: Public erişilebilir URL (ngrok, Cloudflare Tunnel, veya production domain)

## Adım 1: Meta App Oluşturma

1. [Meta for Developers](https://developers.facebook.com/apps/) sayfasına gidin
2. "Create App" butonuna tıklayın
3. App türü olarak **"Business"** seçin
4. App adı ve iletişim e-postası girin
5. App'i oluşturun

## Adım 2: Facebook Page Access Token Alma

### 2.1. Messenger Product Ekleme

1. App Dashboard'da **"Add Product"** butonuna tıklayın
2. **"Messenger"** product'ını bulun ve **"Set Up"** butonuna tıklayın

### 2.2. Page Access Token Alma

1. Messenger ayarlarında **"Access Tokens"** bölümüne gidin
2. **"Add or Remove Pages"** butonuna tıklayın
3. Bağlamak istediğiniz Facebook sayfasını seçin
4. Sayfayı seçtikten sonra **"Generate Token"** butonuna tıklayın
5. Oluşturulan **Page Access Token**'ı kopyalayın (daha sonra kullanacağız)

### 2.3. Page ID Bulma

1. Sayfa ayarlarına gidin
2. Sayfa bilgilerinde **Page ID**'yi bulun veya
3. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) kullanarak Page ID'yi alın:
   - Access Token olarak Page Access Token'ı seçin
   - `me?fields=id,name` sorgusu çalıştırın
   - Response'da `id` değeri Page ID'dir

## Adım 3: Instagram Business Account (Opsiyonel)

Instagram mesajları için:

1. App Dashboard'da **"Add Product"** → **"Instagram"** seçin
2. Instagram Business hesabınızı bağlayın
3. Instagram Account ID'yi not edin

## Adım 4: Webhook Kurulumu

### 4.1. Webhook URL Hazırlama

Conversa webhook URL'iniz şu formatta olmalı:
```
https://your-domain.com/api/webhooks/meta
```

**Not**: Development için ngrok kullanabilirsiniz:
```bash
ngrok http 3000
# Örnek URL: https://abc123.ngrok-free.app/api/webhooks/meta
```

### 4.2. Environment Variable

`.env.local` dosyasına ekleyin:
```env
META_VERIFY_TOKEN=your-secret-verify-token-here
```

Bu token'ı webhook verification için kullanacağız (rastgele bir string olabilir).

### 4.3. Webhook Subscription

1. App Dashboard'da **Messenger** → **Settings** → **Webhooks** bölümüne gidin
2. **"Add Callback URL"** butonuna tıklayın
3. **Callback URL**: `https://your-domain.com/api/webhooks/meta`
4. **Verify Token**: `.env.local`'deki `META_VERIFY_TOKEN` değeri
5. **Subscription Fields** seçin:
   
   **Zorunlu:**
   - ✅ `messages` - Mesajları almak için (mutlaka seçilmeli)
   
   **Önerilen (Temel Mesajlaşma):**
   - ✅ `message_deliveries` - Mesaj teslimat durumlarını takip etmek için
   - ✅ `message_reads` - Mesaj okundu bilgisini almak için
   - ✅ `messaging_postbacks` - Quick reply butonları ve postback event'leri için
   
   **Opsiyonel (İleri Seviye):**
   - `message_echoes` - Bot'un gönderdiği mesajların echo'ları (genellikle gerekmez)
   - `messaging_referrals` - Referral link'lerden gelen mesajlar
   - `messaging_account_linking` - Hesap bağlama event'leri
   
   **Gereksiz (Conversa için):**
   - ❌ `messaging_payments` - Ödeme işlemleri (mesajlaşma için gerekmez)
   - ❌ `messaging_game_plays` - Oyun event'leri
   - ❌ `messaging_pre_checkouts` - Checkout işlemleri
   - ❌ `messaging_checkout_updates` - Checkout güncellemeleri
   - ❌ `messaging_optins` - Opt-in event'leri (genellikle gerekmez)
   - ❌ `messaging_optouts` - Opt-out event'leri (genellikle gerekmez)
   - ❌ `message_edits` - Mesaj düzenleme (WhatsApp'ta yok, Facebook'ta nadir)
   - ❌ `message_reactions` - Mesaj reaksiyonları (şu an desteklenmiyor)
   - ❌ `standby` - Standby mode (genellikle gerekmez)
   - ❌ Diğer tüm field'lar (feed, call_settings_update, vb.)

6. **"Verify and Save"** butonuna tıklayın

### 4.4. Page Subscription

1. Webhook oluşturulduktan sonra, **"Add Subscriptions"** butonuna tıklayın
2. Bağlamak istediğiniz **Facebook Page**'i seçin
3. **"Subscribe"** butonuna tıklayın

## Adım 5: Instagram Webhook (Opsiyonel)

Instagram mesajları için:

1. App Dashboard'da **Instagram** → **Basic Display** veya **Instagram Graph API**
2. Webhook URL'i ekleyin: `https://your-domain.com/api/webhooks/meta`
3. Verify Token'ı girin
4. Instagram Business hesabınızı subscribe edin

## Adım 6: Conversa'ya Channel Ekleme

1. Conversa uygulamasında **Settings** → **Channels** sayfasına gidin
2. **"Add Channel"** butonuna tıklayın
3. Channel Type olarak **"Facebook Page"** veya **"Instagram Business"** seçin
4. Bilgileri doldurun:
   - **Display Name**: Örn. "My Facebook Page"
   - **Page ID**: Adım 2.3'te aldığınız Page ID
   - **Access Token**: Adım 2.2'de aldığınız Page Access Token
5. **"Add Channel"** butonuna tıklayın

## Adım 7: Test Etme

1. Facebook sayfanıza mesaj gönderin
2. Conversa inbox'ında mesajın göründüğünü kontrol edin
3. Mesaj gönderip alabilmeyi test edin

## Sorun Giderme

### Webhook Verification Başarısız

- `META_VERIFY_TOKEN` environment variable'ın doğru ayarlandığından emin olun
- Webhook URL'inin public erişilebilir olduğunu kontrol edin
- ngrok kullanıyorsanız, URL'in güncel olduğundan emin olun

### Mesajlar Görünmüyor

- Webhook subscription'ların aktif olduğunu kontrol edin
- Page Access Token'ın geçerli olduğundan emin olun
- Server loglarını kontrol edin (`/api/webhooks/meta` endpoint'ine istek geliyor mu?)

### Access Token Süresi Doldu

- Page Access Token'lar süresiz olabilir, ancak bazı durumlarda yenilenmesi gerekebilir
- Token'ı yenilemek için Messenger Settings'ten yeni token oluşturun
- Conversa'da channel'ı güncelleyin

## API Referansları

- [Meta Messenger Platform](https://developers.facebook.com/docs/messenger-platform)
- [Instagram Messaging](https://developers.facebook.com/docs/instagram-platform/instagram-messaging)
- [Graph API Reference](https://developers.facebook.com/docs/graph-api)

## Notlar

- **Facebook Page** mesajları: `facebook_page` channel type
- **Instagram Business** mesajları: `instagram_business` channel type
- Her iki kanal da aynı webhook endpoint'ini (`/api/webhooks/meta`) kullanır
- Meta webhook'ları otomatik olarak `inbound` direction olarak işlenir
- Mesaj gönderme için Page Access Token gereklidir
