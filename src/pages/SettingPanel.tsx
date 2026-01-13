import { useState, type FormEvent } from "react";

import { useAuth } from "../context/auth";

type SettingPanelProps = {
  opacity: number;
  onOpacityChange: (value: number) => void;
  isLocked: boolean;
  lockEnabled: boolean;
  hasLockPassword: boolean;
  onToggleLock: (next: boolean) => void;
  onToggleLockEnabled: (next: boolean) => void;
  onSetLockPin: (pin: string) => Promise<void>;
  canControlWindow: boolean;
};

type LoginForm = {
  email: string;
  password: string;
};

type SignupForm = {
  name: string;
  email: string;
  password: string;
  confirm: string;
};

const INITIAL_LOGIN_FORM: LoginForm = { email: "", password: "" };
const INITIAL_SIGNUP_FORM: SignupForm = { name: "", email: "", password: "", confirm: "" };

const formatOpacity = (value: number) => `${Math.round(value * 100)}%`;

const SOCIAL_PROVIDERS = [
  { id: "kakao", name: "Kakao", short: "K", badge: "bg-amber-300 text-amber-950" },
  { id: "naver", name: "Naver", short: "N", badge: "bg-emerald-500 text-white" },
  { id: "google", name: "Google", short: "G", badge: "bg-rose-500 text-white" },
];

export default function SettingPanel({
  opacity,
  onOpacityChange,
  isLocked,
  lockEnabled,
  hasLockPassword,
  onToggleLock,
  onToggleLockEnabled,
  onSetLockPin,
  canControlWindow,
}: SettingPanelProps) {
  const [pinDraft, setPinDraft] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [showPinSetup, setShowPinSetup] = useState(false);

  const resetPinForm = () => {
    setPinDraft("");
    setPinConfirm("");
    setPinError("");
  };

  const { user, status: authStatus, error: authError, signIn, signUp, logout } = useAuth();
  const [loginForm, setLoginForm] = useState<LoginForm>(INITIAL_LOGIN_FORM);
  const [signupForm, setSignupForm] = useState<SignupForm>(INITIAL_SIGNUP_FORM);
  const [formMessage, setFormMessage] = useState("");
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");

  const isAuthBusy = authStatus === "loading";
  const authMessage = authError ?? formMessage;

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");
    try {
      await signIn({ email: loginForm.email, password: loginForm.password });
      setFormMessage("Logged in successfully.");
      setLoginForm(INITIAL_LOGIN_FORM);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Login failed.");
    }
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (signupForm.password !== signupForm.confirm) {
      setFormMessage("Password confirmation does not match.");
      return;
    }
    setFormMessage("");
    try {
      await signUp({ email: signupForm.email, password: signupForm.password, name: signupForm.name });
      setFormMessage("Signup complete and you are now logged in.");
      setSignupForm(INITIAL_SIGNUP_FORM);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Signup failed.");
    }
  };

  const handleLogout = () => {
    setFormMessage("");
    logout();
  };

  const handlePinSubmit = async () => {
    if (!/^\d{4,6}$/.test(pinDraft)) {
      setPinError("PIN must be 4 to 6 digits.");
      return;
    }
    if (pinDraft !== pinConfirm) {
      setPinError("PIN entries do not match.");
      return;
    }
    await onSetLockPin(pinDraft);
    resetPinForm();
    setShowPinSetup(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <aside className="w-full rounded-2xl border border-slate-200 bg-white p-4 md:w-48">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">정보</div>
          <button className="mt-3 w-full rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-left text-sm text-white">
            릴리스 노트 보기
          </button>
        </aside>

        <section className="flex-1 space-y-6">
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">TODOongs account</div>
                <div className="text-xs text-slate-500">회원가입 또는 로그인해서 프로필과 채팅용 PK를 유지하세요.</div>
              </div>
              {user ? (
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              ) : null}
            </div>

            {user ? (
              <div className="mt-4 space-y-1 rounded-xl border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-800">
                <div className="text-base font-semibold text-slate-900">{user.name}</div>
                <div className="text-xs text-slate-500">Email: {user.email}</div>
                <div className="text-xs text-slate-500">ID: {user.userId}</div>
                <div className="text-xs text-slate-500">Provider: {user.provider}</div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex w-full rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold">
                  {(["login", "signup"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setAuthTab(tab)}
                      className={`flex-1 px-4 py-2 transition ${
                        authTab === tab
                          ? "rounded-2xl bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {tab === "login" ? "로그인" : "회원가입"}
                    </button>
                  ))}
                </div>

                {authTab === "login" ? (
                  <form className="space-y-3 pt-4" onSubmit={handleLogin}>
                    <div className="text-xs font-semibold text-slate-400">이메일 계정으로 로그인</div>
                    <input
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="이메일"
                      autoComplete="email"
                      disabled={isAuthBusy}
                    />
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="비밀번호"
                      autoComplete="current-password"
                      disabled={isAuthBusy}
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
                      disabled={isAuthBusy || !loginForm.email || !loginForm.password}
                    >
                      {isAuthBusy ? "로그인 중..." : "로그인"}
                    </button>
                  </form>
                ) : (
                  <form className="space-y-3 pt-4" onSubmit={handleSignup}>
                    <div className="text-xs font-semibold text-slate-400">새로운 계정 만들기</div>
                    <input
                      type="text"
                      value={signupForm.name}
                      onChange={(e) => setSignupForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="이름"
                      disabled={isAuthBusy}
                    />
                    <input
                      type="email"
                      value={signupForm.email}
                      onChange={(e) => setSignupForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="이메일"
                      autoComplete="email"
                      disabled={isAuthBusy}
                    />
                    <input
                      type="password"
                      value={signupForm.password}
                      onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="비밀번호 (6자 이상)"
                      autoComplete="new-password"
                      disabled={isAuthBusy}
                    />
                    <input
                      type="password"
                      value={signupForm.confirm}
                      onChange={(e) => setSignupForm((prev) => ({ ...prev, confirm: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="비밀번호 확인"
                      disabled={isAuthBusy}
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-slate-900/20 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-70"
                      disabled={
                        isAuthBusy || !signupForm.name || !signupForm.email || !signupForm.password || !signupForm.confirm
                      }
                    >
                      {isAuthBusy ? "가입 처리 중..." : "가입하기"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {authMessage ? (
              <div className={`mt-4 text-xs ${authError ? "text-rose-600" : "text-emerald-600"}`}>{authMessage}</div>
            ) : isAuthBusy ? (
              <div className="mt-4 text-xs text-slate-500">Waiting for response...</div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-900">창 투명도</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.04}
                value={opacity}
                onChange={(e) => onOpacityChange(Number(e.target.value))}
                className="w-full accent-slate-900 md:max-w-md"
                disabled={!canControlWindow}
              />
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                {formatOpacity(opacity)}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {canControlWindow
                ? "네이티브 컨트롤이 있으면 투명도를 조절할 수 있어요."
                : "현재 환경에서는 창 제어가 제한되어 있습니다."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-900">잠금 모드</div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                PIN 잠금을 설정하면 활성 상태에서 Ctrl + L로 잠금/해제를 조절할 수 있습니다.
              </div>
              <div className="flex items-center gap-2">
                {lockEnabled ? (
                  <button
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    onClick={() => onToggleLockEnabled(false)}
                  >
                    잠금 해제
                  </button>
                ) : (
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    onClick={() => (hasLockPassword ? onToggleLockEnabled(true) : setShowPinSetup(true))}
                  >
                    잠금 설정
                  </button>
                )}
                {lockEnabled ? (
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    onClick={() => setShowPinSetup(true)}
                  >
                    PIN 변경
                  </button>
                ) : null}
              </div>
            </div>

            {showPinSetup ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 text-xs font-semibold text-slate-600">4~6자리 숫자 PIN을 입력하세요</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinDraft}
                    maxLength={6}
                    onChange={(e) => {
                      setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setPinError("");
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="PIN (숫자)"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinConfirm}
                    maxLength={6}
                    onChange={(e) => {
                      setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setPinError("");
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="PIN 확인"
                  />
                </div>
                {pinError ? <div className="mt-2 text-xs text-rose-600">{pinError}</div> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    onClick={() => {
                      setShowPinSetup(false);
                      resetPinForm();
                    }}
                  >
                    취소
                  </button>
                  <button
                    className="rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-sm text-white"
                    onClick={() => void handlePinSubmit()}
                  >
                    적용
                  </button>
                </div>
              </div>
            ) : null}

            {lockEnabled && hasLockPassword ? (
              <div className="mt-3 text-xs text-slate-500">
                현재 상태: {isLocked ? "잠금" : "해제"}. Ctrl + L로 {isLocked ? "해제" : "잠금"}할 수 있습니다.
                <button
                  className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                  onClick={() => onToggleLock(!isLocked)}
                >
                  {isLocked ? "해제하기" : "잠그기"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-900">소셜 로그인</div>
            <div className="space-y-2">
              {SOCIAL_PROVIDERS.map((provider) => (
                <div
                  key={provider.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${provider.badge}`}
                    >
                      {provider.short}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{provider.name}</div>
                      <div className="text-xs text-slate-500">OAuth2 로그인을 추후 연동할 예정입니다.</div>
                    </div>
                  </div>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500"
                    disabled
                  >
                    준비 중
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              클라이언트 ID를 설정하면 Spring Boot 백엔드에서 OAuth2 로그인을 처리합니다.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
