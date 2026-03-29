-- users_new テーブルに不足しているカラムを追加
-- XserverのphpMyAdmin等で実行してください

-- パスワード
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT NULL;

-- Authenticator用シークレット (TOTP Base32)
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS secret VARCHAR(255) DEFAULT NULL;

-- 役職 (member, manager, director, general_manager, executive)
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS position VARCHAR(50) DEFAULT 'member';

-- 権限ロール
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT '一般';

-- 管理者フラグ
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS isAdmin TINYINT(1) DEFAULT 0;

-- 作成日時
ALTER TABLE users_new ADD COLUMN IF NOT EXISTS createdAt VARCHAR(50) DEFAULT NULL;
