import { IconMoonStars, IconShieldLock } from "@tabler/icons-react";

import styles from "./settings.module.css";

export default function SettingsPage() {
  return (
    <main className={styles.settingsPage}>
      <header>
        <p>SETTINGS</p>
        <h1>设置</h1>
        <span>当前版本仅展示界面偏好，不保存到服务器。</span>
      </header>
      <section aria-label="界面设置">
        <article>
          <IconMoonStars aria-hidden="true" size={22} stroke={1.6} />
          <div>
            <strong>外观</strong>
            <span>暖黑主题</span>
          </div>
          <span>已启用</span>
        </article>
        <article>
          <IconShieldLock aria-hidden="true" size={22} stroke={1.6} />
          <div>
            <strong>数据模式</strong>
            <span>本地 mock 数据</span>
          </div>
          <span>无后端连接</span>
        </article>
      </section>
    </main>
  );
}
