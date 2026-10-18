# 脳内日本地図

47都道府県のピースを、記憶だけで日本地図に置いていく無料ゲームです。
置いた位置と正解のズレ(km)で採点し、結果を画像にしてXにシェアできます。

- 10県チャレンジ: ランダムな10県(約1分)
- 全47県チャレンジ: 日本を丸ごと(約5分)
- 東京都だけは基準として最初から置いてあります
- 画面のどこをドラッグしても県が動くので、スマホでも指で隠れません
- 結果画面の「答え合わせ」で、県が正解の位置へ飛んでいくアニメが見られます

サーバーは不要で、HTML/CSS/JSだけで動きます。広告・課金・ログインはありません。

## 公開のしかた(GitHub Pages)

1. このリポジトリを開き、`Settings` → `Pages` を開く
2. `Build and deployment` の `Source` を `Deploy from a branch` にする
3. `Branch` にこのコードがあるブランチ(`/ (root)`)を選んで `Save`
4. 1〜2分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べる

公開URLがこの README のものと違う場合は、`index.html` の `og:image` と `og:url` の
URLを実際のものに変えてください(Xのプレビュー画像に使われます)。

## 採点のしくみ

- 置いた位置と正解位置の距離を km に直し、1県ごとに0〜100点
- 0kmで100点、500km以上ズレると0点(ズレが小さいほど点が高い曲線)
- 全県の平均が総合点で、点数に応じて称号が付く

## 開発メモ

- `js/app.js` ゲーム本体 / `js/data.js` 地図データ(生成物) / `css/style.css` 見た目
- `tools/build-data.mjs` が地図データを作ります。元データを取り直す場合:

```sh
curl -O https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson
npx mapshaper japan.geojson -filter-islands min-area=10km2 remove-empty \
  -simplify 6% keep-shapes -o simplified.json format=geojson precision=0.001
node tools/build-data.mjs simplified.json js/data.js
```

- `tools/ogp.html` はXのプレビュー画像(`ogp.png`)の元です。1200x630で画面キャプチャして保存します
- 手元で試すには `python3 -m http.server` などで配信して `index.html` を開く

## 地図データの出典

地球地図日本(国土地理院ほか)の都道府県界を、
[dataofjapan/land](https://github.com/dataofjapan/land) が変換したGeoJSONから、
簡略化・加工して利用しています。出典の明記が利用条件です(非商用での利用)。
広告や課金を付ける場合は、利用条件を再確認してください。
