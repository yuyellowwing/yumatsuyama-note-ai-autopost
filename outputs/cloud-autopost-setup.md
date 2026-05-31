# note自動投稿をPCスリープ中でも動かす設定

これは、あなたのPCではなく、ネット上で毎朝8:00に動く仕組みです。
PCを閉じていても投稿できる形を目指します。

## 今できたこと

このフォルダに、毎朝8:00にnoteへ投稿するためのファイルを作りました。
GitHubへ置けば、毎朝8:00に動く設定も入っています。

作成済みの主なファイル:

- `.github/workflows/note-daily-post.yml`
- `scripts/generate-article.mjs`
- `scripts/post-note.mjs`
- `scripts/save-note-login-cdp.mjs`

## 毎朝やること

1. AIの最新情報を調べる
2. note記事を書く
3. noteに投稿する

## まだ必要なこと

次の2つは、あなたのアカウントに関わるので、こちらだけでは完了できません。

1. このフォルダをGitHubに置く
2. GitHubの設定画面に、投稿に必要な秘密情報を入れる

入れる秘密情報:

- `OPENAI_API_KEY`
- `NOTE_STORAGE_STATE_B64`

`NOTE_STORAGE_STATE_B64` は、noteにログイン済みの状態です。
noteのパスワードをここに書く必要はありません。

## 条件の確認

noteのログインが切れた、本人確認が出た、画面が変わった場合は止まります。
その場合は、今あるPC起動方式をそのまま使います。

つまり、クラウド版が成功するまでは、明日8:00のPC起動方式を残します。
