# Evolution API Bağlantı Rehberi

Bu rehber, Unified Inbox'u Evolution API ile bağlamak için gerekli adımları açıklar.

## Gereksinimler

1. Çalışan bir Evolution API sunucusu
2. Evolution API'de oluşturulmuş bir instance
3. Evolution API'den alınmış API Key

## Adım 1: Evolution API Instance Oluşturma

Evolution API sunucunuzda bir instance oluşturun:

```bash
# Evolution API'de instance oluşturma örneği
curl -X POST https://your-evolution-api.com/instance/create \
  -H "apikey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "my-whatsapp-instance",
    "token": "optional-token",
    "qrcode": true
  }'
```

**Önemli:** Instance adını not edin, Unified Inbox'ta kullanacaksınız.

## Adım 2: Unified Inbox'ta Kanal Ekleme

1. Unified Inbox'a giriş yapın
2. Sidebar'dan **"Channels"** sayfasına gidin
3. **"Add Channel"** butonuna tıklayın
4. Formu doldurun:
   - **Channel Type:** WhatsApp (Evolution API)
   - **Display Name:** İstediğiniz bir isim (örn: "My WhatsApp Business")
   - **Base URL:** Evolution API sunucunuzun URL'i
     - Örnek: `https://evo.example.com`
     - Örnek: `http://localhost:8080` (yerel test için)
   - **Instance Name:** Evolution API'de oluşturduğunuz instance adı
   - **API Key:** Evolution API'den aldığınız API anahtarı

5. **"Add Channel"** butonuna tıklayın

## Adım 3: Webhook Yapılandırması

### Yerel Geliştirme (ngrok ile)

1. **ngrok kurulumu:**
   ```bash
   npm install -g ngrok
   # veya
   # https://ngrok.com/download adresinden indirin
   ```

2. **Next.js sunucusunu başlatın:**
   ```bash
   pnpm dev
   ```

3. **ngrok ile expose edin:**
   ```bash
   ngrok http 3000
   ```

4. **ngrok URL'ini not edin:**
   - Örnek: `https://abc123.ngrok.io`
   - Webhook URL: `https://abc123.ngrok.io/api/webhooks/evolution`

### Production

Webhook URL'iniz:
```
https://your-domain.com/api/webhooks/evolution
```

### Evolution API'de Webhook Ayarlama

Evolution API'de webhook'u ayarlamak için:

```bash
curl -X POST https://your-evolution-api.com/webhook/set/YOUR_INSTANCE_NAME \
  -H "apikey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/webhooks/evolution",
    "webhook_by_events": true,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE"
    ]
  }'
```

**veya Evolution API Admin Panel'den:**

1. Evolution API Admin Panel'e giriş yapın
2. Instance'ınızı seçin
3. Webhook ayarlarına gidin
4. Webhook URL'ini girin: `https://your-domain.com/api/webhooks/evolution`
5. Event'leri seçin:
   - `MESSAGES_UPSERT`
   - `MESSAGES_UPDATE`
6. Kaydedin

## Adım 4: Test Etme

1. WhatsApp'tan Evolution API instance'ınıza bağlı numaraya mesaj gönderin
2. Unified Inbox'ta **"Inbox"** sayfasına gidin
3. Mesajınızın görünmesi gerekir

## Sorun Giderme

### Webhook Mesajları Gelmiyor

1. **Webhook URL'ini kontrol edin:**
   - Evolution API'de doğru URL ayarlandı mı?
   - URL erişilebilir mi? (curl ile test edin)

2. **Instance adını kontrol edin:**
   - Unified Inbox'ta girdiğiniz instance adı, Evolution API'deki instance adıyla aynı mı?

3. **API Key'i kontrol edin:**
   - API Key doğru mu?
   - API Key'in webhook okuma izni var mı?

4. **Logları kontrol edin:**
   - Next.js terminal çıktısını kontrol edin
   - Evolution API loglarını kontrol edin

### Mesajlar Görünmüyor

1. **Conversation listesini yenileyin**
2. **SSE bağlantısını kontrol edin** (tarayıcı console'da)
3. **Database'de webhook event'lerini kontrol edin:**
   ```bash
   pnpm db:studio
   ```
   - `WebhookEvent` tablosunu kontrol edin

## Evolution API Dokümantasyonu

Daha fazla bilgi için:
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
- [Evolution API Dokümantasyon](https://doc.evolution-api.com/)

