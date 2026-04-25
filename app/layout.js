import "./globals.css";

export const metadata = {
  title: "Грузия: Своя игра",
  description: "Jeopardy-игра для большого экрана с вопросами, ответами и поясняющими слайдами.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
