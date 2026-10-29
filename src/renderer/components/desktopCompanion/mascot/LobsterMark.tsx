interface LobsterMarkProps {
  size: number;
  className?: string;
}

/** The default companion badge using the HeyClaw app logo. */
export default function LobsterMark({ size, className }: LobsterMarkProps) {
  return (
    <img
      src="logo.png"
      alt="HeyClaw"
      width={size}
      height={size}
      className={`lobster-mark rounded-full object-cover select-none ${className ?? ''}`}
      draggable={false}
    />
  );
}
