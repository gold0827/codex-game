# 자율군단 지휘학교

## 설명

자율 장교들이 스스로 판단하는 실시간 픽셀 전장. 플레이어는 명령 대신 정보·권한·검증·피드백 조건을 설계해 여섯 작전을 완수하고 졸업을 이끈다.

- 글자 수: `81자`
- 플레이: [자율군단 지휘학교](https://gold0827.github.io/codex-game/)
- 썸네일: [`docs/submission/thumbnail.png`](./thumbnail.png)
- 제작·심사 증거: [Codex 협업과 다섯 심사 기준](./production-evidence.ko.md)
- 크기: `1664×936 px`
- 파일 크기: `2410854 bytes`

## 측정 명령

설명 글자 수:

```powershell
$description = '자율 장교들이 스스로 판단하는 실시간 픽셀 전장. 플레이어는 명령 대신 정보·권한·검증·피드백 조건을 설계해 여섯 작전을 완수하고 졸업을 이끈다.'
$description.Length
```

썸네일 크기와 파일 크기:

```powershell
$path = 'docs/submission/thumbnail.png'
Add-Type -AssemblyName PresentationCore
$stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $path))
try {
  $decoder = [System.Windows.Media.Imaging.PngBitmapDecoder]::new($stream, [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
  $frame = $decoder.Frames[0]
  "{0}x{1}" -f $frame.PixelWidth, $frame.PixelHeight
} finally {
  $stream.Dispose()
}
(Get-Item -LiteralPath $path).Length
```
