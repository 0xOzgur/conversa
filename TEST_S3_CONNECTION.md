# S3 Bağlantısını Test Etme

`messages.upsert` event'i gelmeden S3 kurulumunu test etmek için alternatif yöntemler:

## Yöntem 1: AWS CLI ile S3'e Test Dosyası Yükleme

**ÖNEMLİ:** `evolution-api-s3` IAM kullanıcısının credentials'larını kullanın. Diğer kullanıcıların `s3:PutObject` izni olmayabilir.

Evolution API sunucunuzda AWS CLI kuruluysa:

```bash
# AWS CLI kurulumu (eğer yoksa)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# AWS credentials yapılandırma
# ÖNEMLİ: evolution-api-s3 kullanıcısının credentials'larını kullanın
# (IAM'den oluşturduğunuz kullanıcının Access Key ve Secret Key'i)
aws configure
# Access Key ID: [evolution-api-s3 kullanıcısının Access Key ID'si]
# Secret Access Key: [evolution-api-s3 kullanıcısının Secret Access Key'i]
# Default region: eu-central-1
# Default output format: json

# VEYA environment variable ile:
export AWS_ACCESS_KEY_ID="[evolution-api-s3 Access Key]"
export AWS_SECRET_ACCESS_KEY="[evolution-api-s3 Secret Key]"
export AWS_DEFAULT_REGION="eu-central-1"

# Test dosyası oluştur
echo "Test file for S3" > /tmp/test-s3.txt

# S3'e yükle
aws s3 cp /tmp/test-s3.txt s3://evo.orfion.com.tr-media/test-s3.txt

# Dosyayı oku (public URL ile)
# NOT: Bucket adında nokta (.) varsa, path-style URL kullanın
curl https://s3.eu-central-1.amazonaws.com/evo.orfion.com.tr-media/test-s3.txt

# VEYA virtual-hosted style (bazı durumlarda çalışmayabilir)
curl https://evo.orfion.com.tr-media.s3.eu-central-1.amazonaws.com/test-s3.txt

# SSL hatası alırsanız, -k flag'i ile test edin (sadece test için)
curl -k https://s3.eu-central-1.amazonaws.com/evo.orfion.com.tr-media/test-s3.txt
```

## Yöntem 2: Evolution API Loglarında S3 Hatalarını Kontrol Etme

Evolution API loglarında S3 ile ilgili hata mesajlarını kontrol edin:

```bash
pm2 logs evolution-api --lines 200 | grep -i -E "(s3|aws|bucket|upload|error)"
```

S3 bağlantı hataları varsa, `.env` dosyasındaki ayarları kontrol edin.

## Yöntem 3: Evolution API Admin Panel'den Test

Evolution API Admin Panel'de (`https://evo.orfion.com.tr`):

1. Instance'ınızı seçin: `Orfion-Oligatto`
2. "Settings" veya "Configuration" sekmesine gidin
3. S3 ayarlarını kontrol edin
4. Eğer test butonu varsa, S3 bağlantısını test edin

## Yöntem 4: Node.js Script ile S3 Test

Evolution API sunucunuzda test script'i oluşturun:

```bash
cd /opt/evolution
cat > test-s3.js << 'EOF'
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION,
  endpoint: `https://${process.env.S3_ENDPOINT}`,
  s3ForcePathStyle: false,
  signatureVersion: 'v4'
});

const params = {
  Bucket: process.env.S3_BUCKET,
  Key: 'test-s3-connection.txt',
  Body: 'Test file for S3 connection',
  ContentType: 'text/plain'
};

s3.putObject(params, (err, data) => {
  if (err) {
    console.error('S3 Upload Error:', err);
  } else {
    console.log('S3 Upload Success:', data);
    
    // Test URL
    const url = `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/test-s3-connection.txt`;
    console.log('Test URL:', url);
  }
});
EOF

# .env dosyasını yükle ve script'i çalıştır
export $(cat .env | grep S3 | xargs)
node test-s3.js
```

## Yöntem 5: curl ile S3 Bucket'a Erişim Testi

```bash
# S3 bucket'ın public erişilebilir olduğunu test edin
curl -I https://evo.orfion.com.tr-media.s3.eu-central-1.amazonaws.com/

# Eğer 403 Forbidden alırsanız, bucket policy'yi kontrol edin
# Eğer 404 Not Found alırsanız, bucket adını kontrol edin
```

## Yöntem 6: Evolution API'nin S3 Bağlantısını Kontrol Etme

Evolution API loglarında S3 başlatma mesajlarını kontrol edin:

```bash
pm2 logs evolution-api --lines 100 | grep -i "s3"
```

S3 başarıyla başlatıldıysa, loglarda şu mesajları görmelisiniz:
- `S3 enabled: true`
- `S3 bucket: evo.orfion.com.tr-media`
- `S3 region: eu-central-1`

## Yöntem 7: Mevcut Mesajın Medyasını Test Etme

Unified Inbox'ta mevcut bir video mesajı varsa:

1. Database'den mesaj ID'sini alın
2. Evolution API'den medyayı çekmeyi deneyin
3. Eğer S3 entegrasyonu çalışıyorsa, `mediaUrl` S3 URL'si olmalı

## Sorun Giderme

### AccessDenied Hatası

Eğer `AccessDenied` hatası alırsanız:

1. **Doğru IAM kullanıcısının credentials'larını kullanın:**
   - `evolution-api-s3` kullanıcısının Access Key ve Secret Key'ini kullanın
   - Diğer kullanıcıların (örn: `evo.orfion.com.tr`) `s3:PutObject` izni olmayabilir

2. **IAM kullanıcısına policy ekleyin:**
   - IAM Console'da `evolution-api-s3` kullanıcısını seçin
   - "Add permissions" → "Attach policies directly"
   - `EvolutionAPIS3Access` policy'sini seçin (veya yeni bir policy oluşturun)

3. **Policy içeriğini kontrol edin:**
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
         "Resource": "arn:aws:s3:::evo.orfion.com.tr-media/*"
       }
     ]
   }
   ```

### S3 Bağlantı Hatası

Eğer S3 bağlantı hatası alırsanız:

1. **Access Key ve Secret Key'i kontrol edin:**
   ```bash
   # Evolution API sunucunuzda
   cat /opt/evolution/.env | grep S3_ACCESS_KEY
   cat /opt/evolution/.env | grep S3_SECRET_KEY
   ```

2. **Bucket adını kontrol edin:**
   ```bash
   cat /opt/evolution/.env | grep S3_BUCKET
   ```

3. **Region ve Endpoint uyumunu kontrol edin:**
   ```bash
   cat /opt/evolution/.env | grep S3_REGION
   cat /opt/evolution/.env | grep S3_ENDPOINT
   ```

### S3 Upload Hatası

Eğer S3'e yükleme hatası alırsanız:

1. **IAM kullanıcısının izinlerini kontrol edin:**
   - `s3:PutObject` izni var mı?
   - `s3:GetObject` izni var mı?

2. **Bucket policy'yi kontrol edin:**
   - Public read izni var mı?

3. **Evolution API loglarını kontrol edin:**
   ```bash
   pm2 logs evolution-api --lines 100 | grep -i "upload"
   ```

## Sonuç

S3 kurulumu başarılıysa:
- AWS CLI ile dosya yükleyebilmelisiniz
- Public URL ile dosyaya erişebilmelisiniz
- Evolution API loglarında S3 hataları olmamalı

S3 kurulumu başarısızsa:
- AWS CLI hata verecek
- Evolution API loglarında S3 hataları görünecek
- Public URL çalışmayacak

