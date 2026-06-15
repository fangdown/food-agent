import "./globals.css";

export const metadata = {
  title: "智能食谱助手",
  description: "大模型菜品搭配 Agent Demo"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
