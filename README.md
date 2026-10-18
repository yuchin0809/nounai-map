# 脳内日本地図

47都道府県のピースを、記憶だけで日本地図に置いていく無料ゲームです。
置いた位置と正解のズレ(km)で採点し、結果を画像にしてXにシェアできます。

- 10県チャレンジ: ランダムな10県(約1分)
- 全47県チャレンジ: 日本を丸ごと(約5分)
- 東京都だけは基準として最初から置いてあります
- 画面のどこをドラッグしても県が動くので、スマホでも指で隠れません
- ドラッグ中は、県の周りを約2.3倍で映す「ルーペ」が出ます(県に重ならない角に自動で移動)
- 2本指のピンチで、白い地図の中だけを最大6倍まで拡大・移動できます(縮尺は本物のまま)。「拡大」ボタンでも切り替えられ、拡大中に県を端へ寄せると表示範囲もついてきます
- PCなど横長の画面では、左に盤面・右に操作を置き、ピース置き場を盤面の右側にして大きく表示します
- 結果画面の「答え合わせ」で、県が正解の位置へ飛んでいくアニメが見られます

サーバーは不要で、HTML/CSS/JSだけで動きます。広告・課金・ログインはありません。

## 公開のしかた(GitHub Pages)

1. このリポジトリを開き、`Settings` → `Pages` を開く
2. `Build and deployment` の `Source` を `Deploy from a branch` にする
3. `Branch` にこのコードがあるブランチ(`/ (root)`)を選んで `Save`
4. 1〜2分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べる

想定している公開URLは `https://yuchin0809.github.io/nounai-map/` です(リポジトリ名を `nounai-map` にした場合)。
リポジトリ名を変えない・別の名前にする場合は、`index.html` の `og:image` と `og:url` の
URLを実際のものに変えてください(Xのプレビュー画像に使われます)。

## 採点のしくみ

- 置いた位置と正解位置の距離を km に直し、1県ごとに0〜100点
- 0kmで100点、500km以上ズレると0点(ズレが小さいほど点が高い曲線)
- 全県の平均が総合点で、点数に応じて15段階の称号が付く(`js/app.js` の `RANKS`。点数が高い順に並べる)

## 開発メモ

- **ファイルを変えたら `index.html` の `?v=` の数字を1つ上げる**(css/js/data の3か所)。
  GitHub Pages はファイルを10分ほどブラウザに保存させるため、上げないと「HTMLだけ新しく、JSは古い」状態になり、新機能が動かなくなります

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
簡略化・加工して利用しています。

- 変換元の README([dataofjapan/land](https://github.com/dataofjapan/land))では、非商用なら「出典の明記」、商用なら「出典の明記+著作権者(地球地図日本)への利用報告」とされています。
- 国土地理院のページでは、個別の商用可否の記載を確認できていません(2026-10-18時点)。広告や課金を付ける場合は、先に利用条件を原文で確認してください。
