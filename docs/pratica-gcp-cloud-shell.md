# Prática GCP — Cloud Shell

Roteiro para criar rede, VMs (frontend público / backend privado), NAT, bucket, conta de serviço e habilitar Vertex AI, executando os comandos no **Google Cloud Shell**.

**Pré-requisitos:** projeto GCP com **billing** ativo; permissões para criar VPC, VMs, firewall, NAT, buckets e IAM.

## Código — o que clonar

O laboratório usa **dois** repositórios (API e site estático). No **Cloud Shell**, rode **uma vez** antes da seção 9 (use sempre o mesmo diretório pai, aqui `~/gcp-demo`):

```bash
mkdir -p ~/gcp-demo && cd ~/gcp-demo
git clone https://github.com/henriquelealmatta-rgb/pratica-gcp-backend.git
git clone https://github.com/henriquelealmatta-rgb/pratica-gcp-frontend.git
```

| Repositório | Papel na GCP |
|-------------|----------------|
| [pratica-gcp-backend](https://github.com/henriquelealmatta-rgb/pratica-gcp-backend) | API na VM backend (porta 5000) |
| [pratica-gcp-frontend](https://github.com/henriquelealmatta-rgb/pratica-gcp-frontend) | Arquivos estáticos na VM frontend (nginx) |

Nas seções 9 e 11, use `cd ~/gcp-demo` (ou o caminho onde os dois clones ficaram lado a lado).

---

## 0) Variáveis (ajuste antes de rodar)

Substitua `SEU-PROJETO-ID` e, se quiser, regiões, nomes de rede e bucket.

```bash
export PROJECT_ID="SEU-PROJETO-ID"
export REGION_FE="us-central1"      # subnet / VM frontend
export REGION_BE="us-east1"          # subnet / VM backend (região vizinha)
export ZONE_FE="${REGION_FE}-a"
export ZONE_BE="${REGION_BE}-b"

export VPC_NAME="demo-vpc"
export SUBNET_FE="subnet-frontend"
export SUBNET_BE="subnet-backend"
export CIDR_FE="10.10.0.0/24"
export CIDR_BE="10.10.1.0/24"

export BUCKET_NAME="${PROJECT_ID}-demo-pdfs"
export SA_ID="backend-demo-sa"
export SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}"
```

---

## 1) APIs necessárias

```bash
gcloud services enable compute.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com
```

---

## 2) VPC custom + duas subnets

```bash
gcloud compute networks create "${VPC_NAME}" --subnet-mode=custom

gcloud compute networks subnets create "${SUBNET_FE}" \
  --network="${VPC_NAME}" \
  --region="${REGION_FE}" \
  --range="${CIDR_FE}"

gcloud compute networks subnets create "${SUBNET_BE}" \
  --network="${VPC_NAME}" \
  --region="${REGION_BE}" \
  --range="${CIDR_BE}" \
  --enable-private-ip-google-access
```

---

## 3) Firewall

### Frontend: HTTP/HTTPS a partir da Internet

```bash
gcloud compute firewall-rules create fw-demo-fe-http-https \
  --network="${VPC_NAME}" \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=frontend
```

### Backend: porta 5000 apenas da subnet do frontend (tráfego interno)

```bash
gcloud compute firewall-rules create fw-demo-be-flask-internal \
  --network="${VPC_NAME}" \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:5000 \
  --source-ranges="${CIDR_FE}" \
  --target-tags=backend
```

### SSH via IAP (útil para VM backend sem IP público)

```bash
gcloud compute firewall-rules create fw-demo-allow-iap-ssh \
  --network="${VPC_NAME}" \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=backend,frontend
```

---

## 4) Cloud NAT (saída à Internet para VMs só com IP privado)

Router e NAT na **mesma região da subnet/VM backend**.

```bash
gcloud compute routers create demo-router \
  --network="${VPC_NAME}" \
  --region="${REGION_BE}"

gcloud compute routers nats create demo-nat \
  --router=demo-router \
  --region="${REGION_BE}" \
  --nat-all-subnet-ip-ranges \
  --auto-allocate-nat-external-ips
```

---

## 5) Bucket Cloud Storage + upload de PDFs

```bash
gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location="${REGION_FE}"
```

Exemplo de upload (coloque PDFs em `~/pdfs` no Cloud Shell antes):

```bash
gcloud storage cp ~/pdfs/*.pdf "gs://${BUCKET_NAME}/"
```

---

## 6) Conta de serviço + papéis (Storage Object Viewer + Vertex AI User)

```bash
gcloud iam service-accounts create "${SA_ID}" \
  --display-name="Backend demo (GCS + Vertex)"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"
```

---

## 7) VMs

### Backend — **sem** IP externo, tag `backend`, SA anexada

```bash
gcloud compute instances create backend-vm \
  --zone="${ZONE_BE}" \
  --machine-type=e2-medium \
  --network="${VPC_NAME}" \
  --subnet="${SUBNET_BE}" \
  --no-address \
  --tags=backend \
  --service-account="${SA_EMAIL}" \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --image-family=debian-12 \
  --image-project=debian-cloud
```

### Frontend — IP público, tag `frontend`

```bash
gcloud compute instances create frontend-vm \
  --zone="${ZONE_FE}" \
  --machine-type=e2-small \
  --network="${VPC_NAME}" \
  --subnet="${SUBNET_FE}" \
  --tags=frontend \
  --image-family=debian-12 \
  --image-project=debian-cloud
```

### Consultar IPs

IP **privado** do backend (para `proxy_pass` no nginx):

```bash
gcloud compute instances describe backend-vm \
  --zone="${ZONE_BE}" \
  --format='get(networkInterfaces[0].networkIP)'
```

IP **público** do frontend:

```bash
gcloud compute instances describe frontend-vm \
  --zone="${ZONE_FE}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

---

## 8) Conectar na VM backend (Cloud Shell)

Na primeira vez, o `gcloud` pode gerar chave SSH em `~/.ssh/` e pedir *passphrase* (pode deixar em branco na prática). Avisos sobre **NumPy** e **DNS zonal** podem ser ignorados para o laboratório.

```bash
# Garanta as variáveis da seção 0 (PROJECT_ID, ZONE_BE, etc.)
gcloud compute ssh backend-vm --zone="${ZONE_BE}" --tunnel-through-iap
```

Quando o prompt for `hlm@backend-vm:~$`, os comandos da **seção 10** rodam **nessa sessão** (dentro da VM).

**Ordem:** clone (**Código — o que clonar**) → **seção 9** (`scp` para a VM backend) → **seção 10** (Python e systemd na VM backend) → **seção 11** (nginx e arquivos na VM frontend).

---

## 9) No Cloud Shell — enviar o repositório **pratica-gcp-backend** para a VM backend

**Saia** do SSH da VM (`exit`) se estiver conectado. Prompt esperado: `...@cloudshell`.

Garanta o clone da seção **Código — o que clonar** (`~/gcp-demo` com as duas pastas). Envie só o backend:

```bash
cd ~/gcp-demo

gcloud compute scp --recurse --tunnel-through-iap \
  pratica-gcp-backend \
  "${USER}@backend-vm:~/" \
  --zone="${ZONE_BE}"
```

Na VM backend isso vira `~/pratica-gcp-backend/` (inclui `.env.example`; o `.env` você cria na **seção 10**).

Se o usuário Linux na VM não for o mesmo do Cloud Shell, troque `"${USER}@backend-vm"` por `"hlm@backend-vm"` (ajuste `hlm`).

Conecte de novo com IAP (**seção 8**) e continue na **seção 10**.

---

## 10) Na VM backend — preparar Python, app e serviço

Substitua `SEU-PROJETO-ID` e o nome do bucket pelos valores reais (os mesmos das variáveis `PROJECT_ID` / `BUCKET_NAME`). **Não** defina `GOOGLE_APPLICATION_CREDENTIALS` na VM: a conta de serviço anexada à VM fornece ADC automaticamente.

### 10.1 Pacotes do sistema e venv

```bash
sudo apt-get update -y
sudo apt-get install -y python3 python3-venv python3-pip
```

### 10.2 Código já enviado (seção 9) — criar o ambiente virtual

Assumindo o repositório em `~/pratica-gcp-backend` (resultado do `scp` da seção 9):

```bash
cd ~/pratica-gcp-backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
```

### 10.3 Arquivo de ambiente (`.env` na raiz do backend)

```bash
nano ~/pratica-gcp-backend/.env
```

Conteúdo mínimo (ajuste projeto, bucket e região Vertex):

```env
GOOGLE_CLOUD_PROJECT=SEU-PROJETO-ID
GCS_BUCKET=SEU-PROJETO-ID-demo-pdfs
VERTEX_LOCATION=us-central1
```

Salve (`Ctrl+O`, Enter) e saia (`Ctrl+X`). Restrinja leitura:

```bash
chmod 600 ~/pratica-gcp-backend/.env
```

**Nota:** na VM com conta de serviço anexada, não precisa de `CORS_ORIGINS` nem `FRONTEND_STATIC_DIR`; o nginx do front encaminha `/api/` para o backend.

### 10.4 Teste rápido manual (opcional)

```bash
cd ~/pratica-gcp-backend
source venv/bin/activate
export $(grep -v '^#' .env | xargs)
gunicorn --bind 0.0.0.0:5000 --workers 1 app:app
```

Em outro terminal IAP na mesma VM, teste:

```bash
curl -s http://127.0.0.1:5000/api/health
```

Pare o teste com `Ctrl+C` no terminal do gunicorn.

### 10.5 Systemd — manter o backend no ar

Crie a unidade (troque `hlm` pelo seu usuário Linux na VM, se for diferente):

```bash
sudo tee /etc/systemd/system/pratica-gcp.service > /dev/null <<'EOF'
[Unit]
Description=Pratica GCP (Flask + Gunicorn)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hlm
Group=hlm
WorkingDirectory=/home/hlm/pratica-gcp-backend
EnvironmentFile=/home/hlm/pratica-gcp-backend/.env
ExecStart=/home/hlm/pratica-gcp-backend/venv/bin/gunicorn --bind 0.0.0.0:5000 --workers 2 app:app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Se o caminho do projeto não for `/home/hlm/pratica-gcp-backend`, ajuste `User`, `WorkingDirectory`, `EnvironmentFile` e `ExecStart` antes do `tee`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pratica-gcp.service
sudo systemctl status pratica-gcp.service
```

Logs em caso de erro:

```bash
journalctl -u pratica-gcp.service -n 50 --no-pager
```

---

## 11) Na VM frontend — nginx (estático + proxy `/api/`)

### 11.1 SSH na VM frontend (IP público; sem IAP)

No **Cloud Shell**:

```bash
gcloud compute ssh frontend-vm --zone="${ZONE_FE}"
```

### 11.2 IP privado do backend

No Cloud Shell (pode rodar antes do SSH do front):

```bash
export BACKEND_IP=$(gcloud compute instances describe backend-vm \
  --zone="${ZONE_BE}" \
  --format='get(networkInterfaces[0].networkIP)')
echo "${BACKEND_IP}"
```

Anote o valor ou use a variável ao editar o nginx na VM front.

### 11.3 Instalar nginx e copiar o frontend

**Dentro da `frontend-vm`:**

```bash
sudo apt-get update -y
sudo apt-get install -y nginx
sudo mkdir -p /var/www/pratica
sudo rm -rf /var/www/pratica/*
sudo chown -R "$USER:$USER" /var/www/pratica
```

**No Cloud Shell** (nova sessão ou após `exit` da front), envie o repositório **pratica-gcp-frontend** para a raiz do site:

```bash
cd ~/gcp-demo/pratica-gcp-frontend
gcloud compute scp --recurse ./* "${USER}@frontend-vm:/var/www/pratica/" --zone="${ZONE_FE}"
```

Se preferir copiar a partir do **diretório pai** (ex.: workspace com os dois repos):

```bash
cd ~/gcp-demo
gcloud compute scp --recurse pratica-gcp-frontend/* "${USER}@frontend-vm:/var/www/pratica/" --zone="${ZONE_FE}"
```

(Ajuste `~/gcp-demo` se você usou outro diretório pai na seção **Código — o que clonar** / seção 9.)

Se der permissão negada após o `scp`, na **frontend-vm**:

```bash
sudo chown -R www-data:www-data /var/www/pratica
```

### 11.4 Site nginx com `proxy_pass` para o backend

Na **frontend-vm**, crie o site (troque `BACKEND_IP` pelo IP privado do backend, ex.: `10.10.1.3`):

```bash
sudo tee /etc/nginx/sites-available/pratica-gcp > /dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    root /var/www/pratica;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://BACKEND_IP:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
```

Substitua **literalmente** `BACKEND_IP` na linha `proxy_pass` pelo IP (não deixe o placeholder). Exemplo com `sed` se você exportou na shell do Cloud Shell e colou o IP:

```bash
# Na frontend-vm, após editar o arquivo com nano se preferir:
sudo nano /etc/nginx/sites-available/pratica-gcp
```

Ative o site e desative o default se conflitar:

```bash
sudo ln -sf /etc/nginx/sites-available/pratica-gcp /etc/nginx/sites-enabled/pratica-gcp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 11.5 Teste no navegador

Abra `http://IP_PUBLICO_DO_FRONTEND/` (IP da seção 7). A UI deve carregar; chamadas a `/api/...` vão pelo nginx até o backend na porta 5000.

---

## 12) Vertex AI

A API `aiplatform.googleapis.com` já é habilitada na seção 1. O `app.py` do backend usa `VERTEX_LOCATION` do `.env` (VM) e um modelo Gemini disponível na região. Com VM backend **sem IP público**, o tráfego do SDK sai pela **NAT** usando a conta de serviço da VM.

---

## Checklist

- [ ] VPC custom e duas subnets em regiões próximas  
- [ ] Regras: 80/443 públicas no front; 5000 só interno no back  
- [ ] NAT na região do backend  
- [ ] Bucket criado e PDFs enviados  
- [ ] SA com `roles/storage.objectViewer` e `roles/aiplatform.user`  
- [ ] Backend sem IP público + SA na VM  
- [ ] Seção 9: `scp` do repositório **pratica-gcp-backend** para `~/pratica-gcp-backend/` (ou equivalente)  
- [ ] Seção 10: SSH IAP na backend + venv, `.env` em `~/pratica-gcp-backend/`, `systemctl` com gunicorn na porta 5000  
- [ ] Seção 11: arquivos do **pratica-gcp-frontend** em `/var/www/pratica/` + VM frontend com IP público + nginx + proxy `/api/` para o IP privado do backend  

---

## Limpeza (opcional — apaga recursos criados)

Ajuste nomes se tiver alterado. **Cuidado:** remove VMs, rede, NAT, regras e bucket.

```bash
# VMs
gcloud compute instances delete frontend-vm --zone="${ZONE_FE}" --quiet
gcloud compute instances delete backend-vm --zone="${ZONE_BE}" --quiet

# NAT + router
gcloud compute routers nats delete demo-nat --router=demo-router --region="${REGION_BE}" --quiet
gcloud compute routers delete demo-router --region="${REGION_BE}" --quiet

# Firewall
gcloud compute firewall-rules delete fw-demo-fe-http-https --quiet
gcloud compute firewall-rules delete fw-demo-be-flask-internal --quiet
gcloud compute firewall-rules delete fw-demo-allow-iap-ssh --quiet

# Subnets + VPC
gcloud compute networks subnets delete "${SUBNET_FE}" --region="${REGION_FE}" --quiet
gcloud compute networks subnets delete "${SUBNET_BE}" --region="${REGION_BE}" --quiet
gcloud compute networks delete "${VPC_NAME}" --quiet

# Bucket (esvazie antes se o gcloud reclamar de objetos)
gcloud storage rm -r "gs://${BUCKET_NAME}/"

# Service account
gcloud iam service-accounts delete "${SA_EMAIL}" --quiet
```
