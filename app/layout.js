import "./globals.css";

export const metadata = {
  title: "美食搭配小助手",
  description: "真实大模型菜品搭配 Agent Demo"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
