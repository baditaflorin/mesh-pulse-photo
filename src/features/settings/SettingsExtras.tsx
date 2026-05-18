type Props = {
  onRecalibrate: () => void;
};

export function SettingsExtras({ onRecalibrate }: Props) {
  return (
    <>
      <button type="button" className="pulse-recalibrate" onClick={onRecalibrate}>
        Recalibrate (clear pulse buffer &amp; restart camera)
      </button>
    </>
  );
}
