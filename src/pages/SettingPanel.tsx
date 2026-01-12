import { useState } from "react";

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

const formatOpacity = (value: number) => `${Math.round(value * 100)}%`;

const SOCIAL_PROVIDERS = [
  {
    id: "kakao",
    name: "카카오",
    short: "K",
    badge: "bg-amber-300 text-amber-950",
  },
  {
    id: "naver",
    name: "네이버",
    short: "N",
    badge: "bg-emerald-500 text-white",
  },
  {
    id: "google",
    name: "구글",
    short: "G",
    badge: "bg-rose-500 text-white",
  },
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

  const handlePinSubmit = async () => {
    if (!/^\d{4,6}$/.test(pinDraft)) {
      setPinError("비밀번호는 4~6자리 숫자만 가능합니다.");
      return;
    }
    if (pinDraft !== pinConfirm) {
      setPinError("비밀번호가 일치하지 않습니다.");
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
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">설정</div>
          <button className="mt-3 w-full rounded-xl border border-slate-900/20 bg-slate-900 px-3 py-2 text-left text-sm text-white">
            일반
          </button>
        </aside>

        <section className="flex-1 space-y-6">
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-900">앱 투명도</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0.6}
                max={1}
                step={0.02}
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
              {canControlWindow ? "창 투명도를 즉시 적용합니다." : "데스크톱 앱에서만 사용할 수 있습니다."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-900">잠금 모드</div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                단축키 Ctrl + L로 잠금. 잠금 해제는 비밀번호 입력으로 가능합니다.
              </div>
              <div className="flex items-center gap-2">
                {lockEnabled ? (
                  <button
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    onClick={() => onToggleLockEnabled(false)}
                  >
                    사용 안 함
                  </button>
                ) : (
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    onClick={() => {
                      if (hasLockPassword) {
                        onToggleLockEnabled(true);
                      } else {
                        setShowPinSetup(true);
                      }
                    }}
                  >
                    잠금 모드 활성화
                  </button>
                )}
                {lockEnabled ? (
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    onClick={() => setShowPinSetup(true)}
                  >
                    비밀번호 변경
                  </button>
                ) : null}
              </div>
            </div>

            {showPinSetup ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-xs font-semibold text-slate-600">비밀번호 설정 (4~6자리)</div>
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
                    placeholder="비밀번호 입력"
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
                    placeholder="비밀번호 확인"
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
                    저장
                  </button>
                </div>
              </div>
            ) : null}

            {lockEnabled && hasLockPassword ? (
              <div className="mt-3 text-xs text-slate-500">
                현재 잠금 모드가 활성화되어 있습니다. {isLocked ? "잠금 상태" : "잠금 해제 상태"}.
                <button
                  className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                  onClick={() => onToggleLock(!isLocked)}
                >
                  {isLocked ? "잠금 해제" : "잠금하기"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-900">소셜 로그인 연동</div>
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
                      <div className="text-xs text-slate-500">미연동</div>
                    </div>
                  </div>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 disabled:opacity-50"
                    disabled
                  >
                    연동하기
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              OAuth2 연동은 서버(Spring Boot) 구현 후 활성화됩니다.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
