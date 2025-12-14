# Evolution API S3/Minio Entegrasyonu Rehberi

Bu rehber, Evolution API'de S3 veya Minio entegrasyonu yaparak medya dosyalarının (resim, video, ses) doğrudan erişilebilir URL'lerle gelmesini sağlar.

## Neden S3/Minio Entegrasyonu?

Evolution API'de S3/Minio entegrasyonu olmadan:
- WhatsApp medya URL'leri şifreli gelir (`mmg.whatsapp.net`)
- Bu URL'ler doğrudan erişilemez
- Medya dosyalarını görüntülemek için Evolution API'nin özel endpoint'lerine ihtiyaç duyulur

S3/Minio entegrasyonu ile:
- Medya dosyaları otomatik olarak S3/Minio'ya yüklenir
- Webhook'ta doğrudan erişilebilir `mediaUrl` gelir
- Medya dosyaları direkt görüntülenebilir

## Seçenek 1: Amazon S3 Entegrasyonu

### 1. AWS S3 Bucket Oluşturma

1. AWS Console'a giriş yapın: https://console.aws.amazon.com
2. S3 servisine gidin
3. "Create bucket" butonuna tıklayın
4. Bucket ayarları:
   - **Bucket name**: `evolution-media` (veya istediğiniz isim)
   - **AWS Region**: `eu-central-1` (Frankfurt) veya size yakın bir bölge
   - **Object Ownership**: ACLs disabled (recommended)
   - **Block Public Access**: Açık tutun (güvenlik için, sonra policy ile açacağız)
   - **Bucket Versioning**: Disable
   - **Default encryption**: SSE-S3 (Amazon S3 managed keys)
5. "Create bucket" butonuna tıklayın

### 1.1. Block Public Access Ayarlarını Kapatma

**ÖNEMLİ:** Bucket policy eklemeden önce Block Public Access ayarlarını kapatmanız gerekiyor!

1. Bucket'ı seçin (`evolution-media` veya bucket adınız)
2. "Permissions" sekmesine gidin
3. "Block Public Access settings for this bucket" bölümüne gidin
4. "Edit" butonuna tıklayın
5. **"Block all public access" seçeneğini KAPATIN** (checkbox'ı boşaltın)
6. Onay kutusuna bucket adını yazın: `evolution-media` (veya bucket adınız)
7. "Save changes" butonuna tıklayın
8. Onay mesajını okuyup "Confirm" butonuna tıklayın

**Uyarı:** AWS size public access'in güvenlik riski olduğunu hatırlatacak. Evolution API için bu gerekli, ancak sadece medya dosyaları public olacak.

### 1.2. Bucket Policy Ekleme (Public Read İçin)

Block Public Access ayarlarını kapattıktan sonra:

1. Aynı "Permissions" sekmesinde kalın
2. "Bucket policy" bölümüne tıklayın
3. "Edit" butonuna tıklayın
4. Aşağıdaki policy'yi ekleyin (**bucket adınızı değiştirmeyi unutmayın**):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::evolution-media/*"
    }
  ]
}
```

**Önemli:** 
- `evolution-media` kısmını kendi bucket adınızla değiştirin
- Bucket adı tam olarak eşleşmeli (büyük/küçük harf duyarlı)
- Eğer hata alırsanız, AWS Console'da bucket'ın tam adını kontrol edin

6. "Save changes" butonuna tıklayın

**Alternatif (Policy Validator ile):**

Eğer hata alırsanız, AWS Policy Validator kullanabilirsiniz:

1. "Policy validator" butonuna tıklayın (bucket policy editörünün altında)
2. Policy'yi yapıştırın
3. "Validate policy" butonuna tıklayın
4. Hataları kontrol edin ve düzeltin

**Not:** Bu policy tüm dosyaları public yapar. Daha güvenli bir yaklaşım için presigned URL kullanabilirsiniz, ancak Evolution API şu anda presigned URL desteklemiyor.

### 2. IAM Kullanıcı ve Access Key Oluşturma

1. IAM Console'a gidin
2. Yeni bir kullanıcı oluşturun (örn: `evolution-api-s3`)
3. S3 bucket'a erişim için policy ekleyin:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::evolution-media/*"
       }
     ]
   }
   ```
4. Access Key ve Secret Key oluşturun

### 3. Evolution API Environment Variables

Evolution API sunucunuzda `.env` dosyasına şu değişkenleri ekleyin:

```env
# S3 Configuration
S3_ENABLED=true
S3_ACCESS_KEY=your-aws-access-key
S3_SECRET_KEY=your-aws-secret-key
S3_BUCKET=evo.orfion.com.tr-media  # Bucket adınız
S3_PORT=443
S3_ENDPOINT=s3.eu-central-1.amazonaws.com  # Bölgenize göre değiştirin (örn: eu-central-1, us-east-1)
S3_USE_SSL=true
S3_REGION=eu-central-1  # S3_ENDPOINT ile AYNI olmalı! (örn: eu-central-1, us-east-1)

# Video upload için (Evolution API v2.3.7+)
S3_SAVE_VIDEO=true
```

**ÖNEMLİ:** 
- `S3_ENDPOINT` formatı: `s3.[region].amazonaws.com` (örn: `s3.eu-central-1.amazonaws.com`)
- `S3_REGION` **MUTLAKA** `S3_ENDPOINT`'teki region ile aynı olmalı!
  - `S3_ENDPOINT=s3.eu-central-1.amazonaws.com` → `S3_REGION=eu-central-1`
  - `S3_ENDPOINT=s3.us-east-1.amazonaws.com` → `S3_REGION=us-east-1`

### 4. Evolution API'yi Yeniden Başlatın

Evolution API'yi yeniden başlatmak için kullandığınız yönteme göre:

**PM2 kullanıyorsanız:**
```bash
pm2 restart evolution-api
# veya process ID ile
pm2 restart 5
```

**Docker kullanıyorsanız:**
```bash
docker-compose restart
# veya
docker restart evolution-api-container-name
```

**Systemd veya başka bir yöntem kullanıyorsanız:**
```bash
# Evolution API'yi durdurup tekrar başlatın
systemctl restart evolution-api
# veya kullandığınız başlatma komutunu tekrar çalıştırın
```

**Restart sonrası kontrol:**
```bash
# PM2 için
pm2 logs evolution-api --lines 50

# Docker için
docker logs evolution-api-container-name --tail 50
```

Environment variable'ların yüklendiğinden emin olun. Loglarda S3 bağlantı hataları varsa, `.env` dosyasındaki S3 ayarlarını kontrol edin.

## Seçenek 2: Minio Entegrasyonu (Self-Hosted)

Minio, S3 uyumlu bir object storage çözümüdür. Kendi sunucunuzda çalıştırabilirsiniz.

### 1. Minio Kurulumu

```bash
# Docker ile Minio kurulumu
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin123" \
  -v /data/minio:/data \
  minio/minio server /data --console-address ":9001"
```

### 2. Minio Bucket Oluşturma

1. Minio Console'a gidin: `http://your-server:9001`
2. Login yapın (root user ve password)
3. Yeni bir bucket oluşturun (örn: `evolution-media`)
4. Bucket policy'yi "public" yapın (veya presigned URL kullanın)

### 3. Evolution API Environment Variables

Evolution API sunucunuzda `.env` dosyasına şu değişkenleri ekleyin:

```env
# Minio Configuration
S3_ENABLED=true
S3_ACCESS_KEY=minioadmin  # Minio root user
S3_SECRET_KEY=minioadmin123  # Minio root password
S3_BUCKET=evolution-media
S3_PORT=9000  # Minio port
S3_ENDPOINT=your-minio-server.com  # Minio sunucu adresi
S3_USE_SSL=false  # HTTP için false, HTTPS için true
S3_REGION=us-east-1  # Minio için genellikle us-east-1
```

### 4. Evolution API'yi Yeniden Başlatın

```bash
docker-compose restart
```

## Test Etme

1. Evolution API'yi yeniden başlattıktan sonra
2. WhatsApp'tan bir resim veya video gönderin
3. Webhook loglarını kontrol edin - `mediaUrl` alanı S3/Minio URL'si olmalı
4. Unified Inbox'ta medya görüntülenmeli

## Sorun Giderme

### MediaUrl Gelmiyor

1. **Environment variables kontrolü:**
   ```bash
   # Evolution API container'ında
   docker exec -it evolution-api-container env | grep S3
   ```

2. **S3/Minio bağlantısı testi:**
   - AWS S3: AWS Console'dan bucket'a dosya yükleyip test edin
   - Minio: Minio Console'dan bucket'a dosya yükleyip test edin

3. **Evolution API logları:**
   ```bash
   docker logs evolution-api-container | grep -i s3
   ```

### 403 Forbidden Hatası

- Bucket policy'yi kontrol edin
- IAM kullanıcısının doğru izinlere sahip olduğundan emin olun
- Minio'da bucket'ın public olduğundan emin olun

### Medya Yüklenmiyor

- `S3_ENABLED=true` olduğundan emin olun
- Access Key ve Secret Key'in doğru olduğundan emin olun
- Endpoint formatının doğru olduğundan emin olun

### Video Mesajları Yüklenmiyor

Eğer Evolution API loglarında şu mesajı görüyorsanız:
```
Video upload is disabled. Skipping video upload.
```

**Çözüm:** Evolution API `.env` dosyasına şu ayarı ekleyin:

```env
S3_SAVE_VIDEO=true
```

Ardından Evolution API'yi yeniden başlatın:
```bash
pm2 restart evolution-api
```

**Not:** Bu ayar Evolution API v2.3.7+ için geçerlidir. Eski versiyonlarda farklı bir ayar adı kullanılıyor olabilir.

### "Location constraint is incompatible" Hatası

Eğer şu hatayı alırsanız:
```
S3Error: The unspecified location constraint is incompatible for the region specific endpoint this request was sent to.
```

**Çözüm:** Evolution API bucket'ı otomatik oluşturmaya çalışıyor. Bucket zaten varsa, Evolution API'nin bucket oluşturmayı atlaması gerekiyor. 

1. **Bucket'ın zaten var olduğundan emin olun:**
   ```bash
   aws s3 ls s3://evo.orfion.com.tr-media/
   ```

2. **Evolution API loglarında bucket oluşturma hatasını görmezden gelebilirsiniz** - Bu sadece ilk başlatmada olur ve bucket zaten varsa sorun değildir.

3. **Alternatif:** Evolution API'nin bucket oluşturma işlemini devre dışı bırakmak için (eğer Evolution API bu özelliği destekliyorsa) `.env` dosyasına ekleyin:
   ```env
   S3_AUTO_CREATE_BUCKET=false
   ```
   (Not: Bu ayar Evolution API versiyonunuza bağlı olarak mevcut olmayabilir)

## Alternatif: Evolution API fetchMedia Endpoint

Eğer S3/Minio entegrasyonu yapmak istemiyorsanız, Evolution API'nin `fetchMedia` endpoint'ini kullanabilirsiniz. Ancak bu endpoint'in doğru formatını Evolution API dokümantasyonunuzdan veya Admin Panel'inizden öğrenmeniz gerekiyor.

## Kaynaklar

- [Evolution API S3/Minio Dokümantasyonu](https://doc.evolution-api.com/v2/pt/integrations/s3minio#webhook-com-mediaurl)
- [AWS S3 Dokümantasyonu](https://docs.aws.amazon.com/s3/)
- [Minio Dokümantasyonu](https://min.io/docs/)

