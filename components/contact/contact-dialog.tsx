'use client';

import Image from 'next/image';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ContactDialogProviderProps {
  children: ReactNode;
  phone: string | null;
  siteName: string;
  wechat: string | null;
}

interface ContactDialogTriggerProps {
  className?: string;
  icon?: string;
  label?: string;
}

const ContactDialogContext = createContext<(() => void) | null>(null);

export function ContactDialogProvider({ children, phone, siteName, wechat }: ContactDialogProviderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();

    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const closeDialog = () => {
    setIsOpen(false);
    setCopyStatus('idle');
  };

  const copyWechat = async () => {
    if (!wechat) return;

    try {
      await navigator.clipboard.writeText(wechat);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <ContactDialogContext.Provider value={() => setIsOpen(true)}>
      {children}
      <dialog
        ref={dialogRef}
        className="contact-dialog"
        aria-labelledby="contact-dialog-title"
        aria-describedby="contact-dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={closeDialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="contact-dialog__panel">
          <div className="contact-dialog__brand">
            <Image
              src="/brand/zhongcheng-official.png"
              alt={`${siteName} Logo`}
              width={2172}
              height={724}
              sizes="(max-width: 640px) 220px, 300px"
              className="contact-dialog__logo"
            />
            <button className="contact-dialog__close" type="button" onClick={closeDialog} aria-label="关闭联系咨询弹窗">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="contact-dialog__content">
            <p className="contact-dialog__eyebrow">CONTACT / 联系咨询</p>
            <h2 id="contact-dialog-title">很高兴为您服务</h2>
            <p id="contact-dialog-description" className="contact-dialog__description">
              欢迎通过电话或微信联系我们，咨询车况、价格或预约到店看车。
            </p>

            <div className="contact-dialog__methods">
              {phone ? (
                <a className="contact-dialog__method" href={`tel:${phone.replace(/\s/g, '')}`}>
                  <span className="contact-dialog__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M8.4 3.5 10.6 8 8.9 9.7a14.8 14.8 0 0 0 5.4 5.4l1.7-1.7 4.5 2.2v3.2c0 .9-.7 1.7-1.6 1.7A15.4 15.4 0 0 1 3.5 5.1c0-.9.8-1.6 1.7-1.6h3.2Z" /></svg>
                  </span>
                  <span className="contact-dialog__method-copy"><small>电话咨询</small><strong>{phone}</strong></span>
                </a>
              ) : (
                <div className="contact-dialog__method contact-dialog__method--disabled">
                  <span className="contact-dialog__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M8.4 3.5 10.6 8 8.9 9.7a14.8 14.8 0 0 0 5.4 5.4l1.7-1.7 4.5 2.2v3.2c0 .9-.7 1.7-1.6 1.7A15.4 15.4 0 0 1 3.5 5.1c0-.9.8-1.6 1.7-1.6h3.2Z" /></svg>
                  </span>
                  <span className="contact-dialog__method-copy"><small>电话咨询</small><strong>暂未配置</strong></span>
                </div>
              )}

              <button
                className={`contact-dialog__method${wechat ? '' : ' contact-dialog__method--disabled'}`}
                type="button"
                onClick={copyWechat}
                disabled={!wechat}
              >
                <span className="contact-dialog__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M9.8 4.2c-4 0-7.3 2.6-7.3 5.9 0 1.9 1.1 3.6 2.8 4.7l-.7 2.3 2.7-1.4c.8.2 1.6.3 2.5.3h.4a5.7 5.7 0 0 1-.2-1.4c0-3.6 3.4-6.5 7.7-6.5h.5c-1-2.3-4.3-3.9-8.4-3.9Zm-2.5 4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm5 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm9.2 6.4c0-2.7-2.7-4.9-6-4.9s-6 2.2-6 4.9 2.7 4.9 6 4.9c.7 0 1.4-.1 2-.3l2.2 1.1-.6-1.9c1.5-.9 2.4-2.3 2.4-3.8Zm-8-1.5a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Zm4.1 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Z" /></svg>
                </span>
                <span className="contact-dialog__method-copy"><small>微信咨询</small><strong>{wechat || '暂未配置'}</strong></span>
                {wechat && <span className="contact-dialog__action">{copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '请手动复制' : '复制微信号'}</span>}
              </button>
            </div>

            <p className="contact-dialog__note">到店前请先联系，我们会提前为您安排车辆与接待。</p>
          </div>
        </div>
      </dialog>
    </ContactDialogContext.Provider>
  );
}

export function ContactDialogTrigger({ className, icon, label = '联系咨询' }: ContactDialogTriggerProps) {
  const openContactDialog = useContext(ContactDialogContext);

  if (!openContactDialog) {
    throw new Error('ContactDialogTrigger must be used within ContactDialogProvider');
  }

  return (
    <button type="button" className={className} onClick={openContactDialog}>
      {label}
      {icon && <span aria-hidden="true">{icon}</span>}
    </button>
  );
}
