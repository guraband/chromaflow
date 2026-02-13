# ChromaFlow

브라우저에서 이미지를 업로드하면 주요 색상을 추출해 모던 웹 디자인용 팔레트를 생성하는 정적 웹앱입니다.

## 실행 방법

정적 파일만으로 구성되어 있어 Netlify, Vercel(Static), GitHub Pages, Cloudflare Pages 등에 바로 배포할 수 있습니다.

로컬 실행 예시:

```bash
python3 -m http.server 8000
```

그 후 `http://localhost:8000` 접속.

## 기능

- 이미지 업로드(클릭/드래그 앤 드롭)
- 주요 색상 자동 추출(버킷 기반 양자화 + 유사 색상 제거)
- 유사 색상 제거 후 부족한 색상 자동 보충(설정한 개수 유지)
- 밝기 순 정렬 + 역할(Base/Surface/Primary/Accent 등) 자동 매핑
- HEX/HSL 정보 및 흰색/검정 배경 대비비(contrast ratio) 표시
- HEX 복사 버튼(Clipboard API + 구형 브라우저 fallback)
- 팔레트 JSON 다운로드
- 모든 처리를 브라우저에서 수행(서버 업로드 없음)
