import { colors } from "@yoorker/tokens";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: colors.backgroundDark,
        color: colors.textOnDark,
        padding: 32,
      }}
    >
      <h1>Yoorker</h1>
      <p style={{ color: colors.brandLight }}>
        Book the exact slot you want, like a yorker lands right on target.
      </p>
    </main>
  );
}
