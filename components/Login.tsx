import React, { useState } from 'react';
import { db } from '../services/storage';
import { Button, Card, Input, Select, Badge } from './UI';
import { UserProfile } from '../types';
import { ShieldCheck, LogIn, UserPlus, KeyRound, ScanLine } from 'lucide-react';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

interface LoginProps {
  onLogin: (user: UserProfile) => void;
}

const DEPARTMENTS = [
  "管理本部",
  "イズライフ事業部",
  "プローン事業部",
  "ブランチ事業部",
  "JIP",
  "IDC企画部",
  "IDC東京",
  "TLC"
];

const INITIAL_ADMIN_ID = "692";
const isAdminId = (id: any) => String(id) === INITIAL_ADMIN_ID;

function getApiUrl(): string {
  const { gasUrl } = db.settingsDb.get();
  return gasUrl?.trim() || "https://kz801xs.xsrv.jp/vitsw/api.php";
}

async function apiPost(action: string, body: Record<string, any>): Promise<any> {
  const base = getApiUrl();
  const sep = base.includes('?') ? '&' : '?';
  const fullUrl = `${base}${sep}action=${action}`;
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`サーバーエラー (${res.status})`);
  }

  const text = await res.text();
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(`接続先エラー: プログラムではなくHTMLが返されました設定を確認してください。`);
  }
  return JSON.parse(text);
}

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<'auth' | 'mfa_setup' | 'mfa_verify'>('auth');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);

  // Form States
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [team, setTeam] = useState('');

  // MFA States
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempGasUrl, setTempGasUrl] = useState(getApiUrl());

  const deptOptions = DEPARTMENTS.map(d => ({ value: d, label: d }));

  const setupMFA = async (user: UserProfile) => {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: "WTSアンケート",
      label: `${user.name} (${user.id})`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret
    });

    try {
      const uri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 2 });
      setQrCodeDataUrl(qrDataUrl);
      setMfaSecret(secret.base32);
      setPendingUser(user);
      setMfaToken('');
      setStep('mfa_setup');
      setError('');
    } catch (err) {
      setError('QRコードの生成に失敗しました。');
      setIsLoading(false);
    }
  };

  const verifySetupMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    
    // Validate Token Locally
    const totp = new OTPAuth.TOTP({
        issuer: "WTSアンケート",
        label: `${pendingUser.name} (${pendingUser.id})`,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(mfaSecret)
    });
    
    if (totp.validate({ token: mfaToken, window: 2 }) === null) {
        setError('認証コードが正しくありません。');
        return;
    }
    
    // Securely update the Database Secret
    setIsLoading(true);
    try {
        const result = await apiPost('update_secret', { id: pendingUser.id, secret: mfaSecret });
        if (!result.success) throw new Error(result.message || "シークレット更新失敗");
        
        const finalUser = { ...pendingUser, secret: mfaSecret };
        db.saveUser(finalUser);
        // ログイン時にローカルキャッシュをSQLへ送り、SQLの最新データを取得する
        await db.settingsDb.sync();
        onLogin(finalUser);
    } catch(err: any) {
        setError("サーバーへのキー保存に失敗しました：" + err.message);
    } finally {
        setIsLoading(false);
    }
  };

  const verifyLoginMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    
    try {
        const totp = new OTPAuth.TOTP({
            issuer: "WTSアンケート",
            label: `${pendingUser.name} (${pendingUser.id})`,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(pendingUser.secret)
        });
        
        if (totp.validate({ token: mfaToken, window: 2 }) !== null) {
            db.saveUser(pendingUser);
            // ログイン時にローカルキャッシュをSQLへ送り、SQLの最新データを取得する
            await db.settingsDb.sync();
            onLogin(pendingUser);
        } else {
            setError('認証コードが正しくありません。');
        }
    } catch (err: any) {
        console.error("MFA Error", err);
        setError("内部エラー(MFAキー解析失敗)。管理者に【MFAパスワード削除】を依頼してください。");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = id.trim();
    
    if (!trimmedId || !password) {
      setError('IDとパスワードは必須です。');
      return;
    }
    if (!/^\d{3}$/.test(trimmedId)) {
      setError('会社IDは3桁の数字で入力してください。');
      return;
    }

    if (isRegisterMode && (!name.trim() || !dept)) {
      setError('氏名と事業部は必須です。');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let validatedUser: UserProfile | null = null;

      if (isRegisterMode) {
        const isAdmin = isAdminId(trimmedId);
        const newUser: UserProfile = {
          id: trimmedId,
          name,
          dept,
          team,
          role: isAdmin ? "ADMIN" : "一般",
          isAdmin,
          password,
          secret: "DISABLED", 
          createdAt: new Date().toISOString()
        };

        const result = await apiPost('register', newUser);
        if (!result.success) {
          setError(result.message || '登録処理に失敗しました。');
          setIsLoading(false);
          return;
        }

        // DBに確実に存在するかテスト
        const verifyResult = await apiPost('login', { id: trimmedId, password });
        if (!verifyResult.success) {
           setError('⚠️ Xserverへ保存できていません。旧api.phpの場合は上書きアップロードしてください。');
           setIsLoading(false);
           return;
        }
        validatedUser = newUser;

      } else {
        const result = await apiPost('login', { id: trimmedId, password });
        if (!result.success) {
          setError(result.message || 'IDまたはパスワードが正しくありません。');
          setIsLoading(false);
          return;
        }
        validatedUser = result.user as UserProfile;
        if (isAdminId(validatedUser.id)) {
          validatedUser.isAdmin = true;
          validatedUser.role = "ADMIN";
        }

        // サーバーが secret を返さない場合、ローカルキャッシュから補完する
        // （PHPのloginエンドポイントがsecretフィールドを返さない実装の場合に対応）
        const isValidSecret = (s: string | undefined) =>
          !!s && !s.startsWith("DISABLED") && s.length >= 10;

        if (!isValidSecret(validatedUser.secret)) {
          // まずサーバーから最新データをpullして最新のsecretを取得する
          await db.settingsDb.pull();
          const cachedUser = db.getUser(validatedUser.id);
          if (isValidSecret(cachedUser?.secret)) {
            validatedUser = { ...validatedUser, secret: cachedUser!.secret };
          }
        }
      }

      // Check MFA requirement
      const hasValidSecret = (s: string | undefined) =>
        !!s && !s.startsWith("DISABLED") && s.length >= 10;
      if (!hasValidSecret(validatedUser.secret)) {
          await setupMFA(validatedUser);
      } else {
          setPendingUser(validatedUser);
          setMfaToken('');
          setStep('mfa_verify');
      }

    } catch (err: any) {
      console.warn('Authentication failed:', err.message);
      setError(`接続エラー: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Settings Button */}
      <div className="absolute top-4 right-4 z-10">
        <Button variant="ghost" onClick={() => { setTempGasUrl(getApiUrl()); setIsSettingsOpen(true); }} className="text-slate-400 hover:text-slate-700">
           SQL API 設定
        </Button>
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4">API接続設定</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 uppercase">API URL (api.php)</label>
                <Input value={tempGasUrl} onChange={e => setTempGasUrl(e.target.value)} placeholder="https://kz801xs.xsrv.jp/vitsw/api.php" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => {
                   const s = db.settingsDb.get();
                   db.settingsDb.save({ ...s, gasUrl: tempGasUrl });
                   setIsSettingsOpen(false);
                   setError('');
                }} className="flex-1">保存して閉じる</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Card className="w-full max-w-md shadow-2xl overflow-hidden">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Wisteria Group</h1>
          <p className="text-slate-500 text-sm font-medium tracking-wide">アンケート エンジン</p>
        </div>

        {step === 'auth' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center mb-6">
              <Badge variant={isRegisterMode ? "warning" : "default"} className="mb-2">
                {isRegisterMode ? "New Account" : "Secure Login"}
              </Badge>
              <h3 className="text-slate-900 font-medium text-lg">
                {isRegisterMode ? "新規アカウント登録" : "システムにログイン"}
              </h3>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 uppercase">会社ID (3桁)</label>
                <Input placeholder="例: 101" value={id} onChange={e => { setId(e.target.value); setError(''); }} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 uppercase">パスワード</label>
                <Input type="password" placeholder="••••••••" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} />
              </div>

              {isRegisterMode && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase">氏名 (Full Name)</label>
                    <Input placeholder="例: 山田 太郎" value={name} onChange={e => { setName(e.target.value); setError(''); }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 uppercase">事業部 (Dept)</label>
                      <Select value={dept} onChange={e => setDept(e.target.value)} options={[{ value: "", label: "選択..." }, ...deptOptions]} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 uppercase">課 (Team) <span className="text-[10px] font-normal">任意</span></label>
                      <Input placeholder="例: 営業1課" value={team} onChange={e => setTeam(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="text-red-500 text-xs text-center bg-red-50 p-2 rounded">{error}</div>}

              <Button type="submit" isLoading={isLoading} className="w-full h-12 mt-4 text-emerald-950 font-bold bg-emerald-400 hover:bg-emerald-500 rounded-xl">
                {isRegisterMode ? "登録して次へ" : "認証して次へ"} 
                <ShieldCheck className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Button
                variant="ghost"
                onClick={() => { setIsRegisterMode(!isRegisterMode); setError(''); }}
                className="text-slate-500 text-sm w-full"
              >
                {isRegisterMode ? "既にアカウントをお持ちの場合はこちら" : "初めての方はこちら（新規登録）"}
              </Button>
            </div>
          </div>
        )}

        {step === 'mfa_setup' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="text-center mb-4">
               <Badge variant="warning" className="mb-2">Security Setup</Badge>
               <h3 className="text-slate-900 font-medium text-lg">2段階認証の初期設定</h3>
               <p className="text-xs text-slate-500 mt-2 text-left">
                  お持ちのスマホの「Google Authenticator」等の認証アプリで、以下のQRコードをスキャンしてください。
               </p>
            </div>
            
            <div className="flex justify-center bg-white p-2 rounded-lg border border-slate-200">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-50 text-slate-400">Generating...</div>
              )}
            </div>

            <form onSubmit={verifySetupMFA} className="space-y-4 mt-6">
              <div className="space-y-2 text-center">
                 <label className="text-xs font-medium text-slate-500 uppercase">アプリに表示された6桁のコード</label>
                 <Input
                   type="text" autoFocus placeholder="000000" maxLength={6}
                   value={mfaToken} onChange={e => { setMfaToken(e.target.value.replace(/\D/g, '')); setError(''); }}
                   className="text-center text-xl tracking-[0.5em] font-mono py-4"
                 />
              </div>

              {error && <div className="text-red-500 text-[11px] text-center font-bold bg-red-50 p-2 rounded-lg">{error}</div>}

              <Button type="submit" isLoading={isLoading} className="w-full h-12 rounded-xl">
                 設定を完了してログイン <KeyRound className="w-4 h-4 ml-2" />
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('auth'); setPassword(''); }} className="w-full">
                 キャンセルして最初へ戻る
              </Button>
            </form>
          </div>
        )}

        {step === 'mfa_verify' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <div className="text-center">
              <Badge className="mb-2 bg-emerald-100 text-emerald-800 border border-emerald-200">Security Verification</Badge>
              <h3 className="text-slate-900 font-medium mb-1">2段階認証</h3>
            </div>

            <div className="flex justify-center my-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <ScanLine className="w-8 h-8" />
              </div>
            </div>

            <form onSubmit={verifyLoginMFA} className="space-y-4">
              <div className="space-y-2">
                 <label className="text-xs font-medium text-slate-500 uppercase text-center block">アプリの6桁の認証コード</label>
                 <Input
                   type="text" autoFocus placeholder="000000" maxLength={6}
                   value={mfaToken} onChange={e => { setMfaToken(e.target.value.replace(/\D/g, '')); setError(''); }}
                   className="text-center text-2xl tracking-[0.5em] font-mono py-6"
                 />
              </div>

              {error && <div className="text-red-500 text-[11px] text-center font-bold bg-red-50 p-2 rounded-lg">{error}</div>}

              <Button type="submit" isLoading={isLoading} className="w-full h-12 rounded-xl text-emerald-950 font-bold bg-emerald-400 hover:bg-emerald-500">
                認証を確認してログイン <ShieldCheck className="w-4 h-4 ml-2" />
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('auth'); setPassword(''); }} className="w-full">
                最初からやり直す
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}