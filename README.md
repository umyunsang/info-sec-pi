# info-sec-pi

`isp`는 현재 디렉터리에서 코드를 읽고 수정하고, 서브에이전트에 작업을 위임하는 CLI입니다. `packages/agent-core`의 에이전트 코어를 실행하고, `isp` 전용 사용자 프로필과 프로젝트 설정을 사용합니다.

## 설치

### npm

공개 레지스트리의 알파 채널이 개설되면 Node.js 22.19 이상에서 다음 명령으로 설치합니다. npm 패키지명은 `@info-sec-pi/isp`, 터미널 명령은 `isp`입니다.

```sh
npm install --global @info-sec-pi/isp@alpha
isp --version
```

기존 비스코프 `isp` 패키지와 설치 경로가 같은 경우, `npm uninstall --global isp`로 기존 패키지를 제거한 뒤 스코프 패키지를 설치합니다.

### GitHub Release

플랫폼별 압축본은 실행에 필요한 Node.js를 포함합니다. 설치 스크립트가 SHA-256을 검증하고 사용자 설치 경로에 `isp`를 배치합니다. 알파판은 태그를 지정합니다. [GitHub Releases](https://github.com/umyunsang/info-sec-pi/releases)

macOS · Linux

```sh
repo=umyunsang/info-sec-pi
ref=v0.3.0-alpha.4
curl -fsSL "https://github.com/$repo/releases/download/$ref/install.sh" |
  sh -s -- --repo "$repo" --ref "$ref"
```

Windows PowerShell

```powershell
$repo = 'umyunsang/info-sec-pi'
$ref = 'v0.3.0-alpha.4'
& ([scriptblock]::Create((irm "https://github.com/$repo/releases/download/$ref/install.ps1"))) -Repo $repo -Ref $ref
```

설치 파일을 직접 받은 경우 `npm install --global ./info-sec-pi-isp-0.3.0-alpha.4.tgz`로 설치할 수 있습니다.

### Homebrew · Nix · mise

- **Homebrew**는 릴리스의 `isp.rb`를 배포 tap의 `Formula/isp.rb`에 넣은 뒤 `brew install OWNER/TAP/isp`로 설치합니다.
- **Nix**는 `nix run "tarball+https://github.com/$repo/releases/download/$ref/isp-flake.tar.gz"`로 실행합니다.
- **mise**는 `mise use -g "github:$repo@${ref#v}"`로 릴리스 버전을 고정합니다.

### 소스에서 실행

Node.js 22.19 이상과 npm이 필요합니다. 소스 디렉터리에서 다음 명령을 실행합니다.

```sh
npm ci
npm --prefix packages/agent-core ci
npm test
npm start
```

어느 디렉터리에서나 `isp`를 쓰려면 위 명령으로 의존성을 준비한 뒤 `npm pack`으로 패키지를 만듭니다. 설치 파일에는 컴파일된 자체 코어, Pi SDK와 실행 의존성이 들어 있습니다. 이미 `.tgz`를 받았다면 설치 명령부터 실행합니다.

```sh
npm pack
npm install --global ./info-sec-pi-isp-0.3.0-alpha.4.tgz
isp --version
```

## 사용 예시

```sh
isp                                      # 대화형 터미널 열기
isp -p "이 프로젝트의 진입점을 설명해 줘"
git diff | isp -p "변경 내용을 요약해 줘"
isp -c                                   # 현재 디렉터리의 최근 세션 이어가기
isp --no-session -p "README.md를 요약해 줘"
isp --model PROVIDER/MODEL -p "이 코드의 테스트 실행 방법을 찾아 줘"
```

`PROVIDER/MODEL`에는 `isp`에서 사용할 공급자와 모델 ID를 입력합니다. 새 사용자 프로필에서는 대화형 터미널의 `/login`으로 공급자를 연결하고 `/model`로 모델을 선택합니다. 종료 명령은 `/quit`입니다.

`-p`는 답변을 표준 출력에 쓰고 종료합니다. 파이프 입력이나 출력 리디렉션을 사용해도 이 모드로 실행됩니다. 명령 인자와 표준 입력을 함께 주면 지시문, 빈 줄, 입력 본문 순서로 모델에 전달합니다. 사용법 오류는 종료 코드 2, 모델 호출 오류는 1을 반환합니다.

## 서브에이전트

`isp`는 Pi 1.6.0의 공식 `subagent` 예제를 기본 도구로 제공합니다. `scout`, `planner`, `reviewer`, `worker`에 작업을 하나씩 위임하거나, 여러 작업을 병렬로 실행하거나, 이전 결과를 다음 작업에 전달할 수 있습니다. 대화형 세션에서 `/scout-and-plan`, `/implement`, `/implement-and-review`로 제공된 워크플로를 실행합니다. [Pi 공식 예제](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/extensions/subagent)

```sh
isp -p 'scout에게 이 저장소의 테스트 진입점을 찾게 하고, planner에게 그 결과를 검토하게 해 줘.'
```

자식 에이전트는 별도 Node 프로세스에서 `isp` 코어와 프로필을 사용하며, 부모의 모델과 추론 수준을 기본으로 상속합니다. 대화는 자식 프로세스의 메모리에 유지되고, 실행 결과와 사용량은 부모 세션에서 확인할 수 있습니다. 내장 위임 도구는 부모 세션에 등록됩니다.

`~/.isp/agent/agents/`의 Markdown 파일에서 역할을 추가하거나 같은 이름의 기본 역할을 재정의할 수 있습니다. `ISP_CODING_AGENT_DIR`을 설정했다면 그 경로의 `agents/`를 사용합니다. 프로젝트 역할은 `.isp/agents/`에 두고 `subagent` 호출에서 `agentScope`를 `project` 또는 `both`로 지정합니다. 역할 파일의 앞부분에 `name`, `description`, 선택적으로 `tools`와 `model`을 적고, 본문에 역할의 시스템 프롬프트를 작성합니다.

## Pi 공식 예제

`isp examples list`에서 Pi 1.6.0에 포함된 확장 78개, SDK 14개, RPC 2개를 볼 수 있습니다. `isp examples run NAME`으로 예제를 선택하고, `isp examples path NAME`으로 진입점의 위치를 확인합니다. [공식 확장 예제](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/README.md) · [공식 SDK 예제](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/sdk.md#examples)

```sh
isp examples list
isp examples run plan-mode --plan
isp examples run 05-tools
isp examples run 14-codemode-mcp
isp examples run rpc-client '이 저장소의 구조를 설명해 줘'
isp examples run rpc-extension-ui
```

소스 디렉터리에서는 `isp` 대신 `npm start --`를 붙여 같은 명령을 실행할 수 있습니다. 확장 예제에는 Pi CLI 옵션을 전달할 수 있습니다. `--extension PATH`를 추가하면 같은 실행에서 다른 확장도 로드합니다. 여러 확장이 같은 명령이나 도구를 등록하는 경우 하나씩 실행합니다. `isp --mode json`은 JSON 이벤트를 출력하고 `isp --mode rpc`는 표준 입출력에서 Pi RPC 프로토콜을 사용합니다.

모델을 호출하는 예제에는 공급자 인증이 필요합니다. SSH 예제는 `--ssh`로 지정한 호스트를, MCP 예제는 `isp` 프로필과 신뢰한 프로젝트의 `mcp.json`을 사용합니다. `truncated-tool`은 `PATH`에 있는 `rg`를 실행하고, `file-trigger`는 `/tmp/agent-trigger.txt`를 감시합니다. Gondolin 예제는 Node 23.6 이상, QEMU, 예제 디렉터리의 npm 의존성이 필요합니다.

## 세션과 설정

| 경로 | 저장하는 내용 |
| --- | --- |
| `~/.isp/agent/` | 사용자 설정, 공급자 인증, 모델 목록, 프로젝트 신뢰, 사용자 확장과 프롬프트 |
| `<프로젝트>/.isp/` | 프로젝트 설정, 시스템 프롬프트, 확장, 스킬, 테마 |
| `~/.isp/sessions/` | 이전 버전에서 만든 기록을 포함한 `isp` 대화 |

`ISP_CODING_AGENT_DIR`로 사용자 프로필을, `ISP_SESSION_DIR` 또는 `--session-dir`로 세션 경로를 지정할 수 있습니다. 프로젝트 설정과 확장을 활성화하려면 `/trust`에서 신뢰를 저장한 뒤 `isp`를 다시 실행합니다. 저장소의 `AGENTS.md`와 표준 `.agents/skills`는 작업 디렉터리가 제공하는 입력입니다.

`isp -c`는 현재 작업 디렉터리의 최신 기록을 열고, 기록이 없으면 새 세션을 시작합니다. `--session ID`는 지정한 기록을 엽니다. `--no-session`은 대화 기록을 메모리에 보관합니다.

## 구성

- `bin/isp.js`가 명령 인자와 표준 입력을 읽어 대화형 또는 단발 실행을 선택합니다.
- `src/pi-sdk.js`가 Pi SDK 1.6.0의 코어 import를 패키지에 포함된 자체 코어로 연결합니다. SDK는 세션, 모델, 코딩 도구와 터미널 UI를 제공합니다.
- `src/subagent/`는 Pi의 공식 확장과 역할·워크플로를 포함합니다. 자식 실행기는 `isp` 세션을 열고 JSON 이벤트를 부모에게 전송합니다.
- `src/examples/`는 내장 SDK의 예제를 찾아 실행하고, 공식 RPC 예제를 `isp` 자식 프로세스에 연결합니다.
- [`packages/agent-core`](packages/agent-core/README.md)는 모델 스트리밍과 턴·도구·이벤트 로직의 TypeScript 소스를 담습니다. 별도 npm 패키지로 빌드할 수 있습니다.
- `test/cli.test.js`가 임시 `isp` 프로필과 로컬 테스트 모델로 파일 읽기, 세션 재개, 프로젝트 설정 분리를 검증합니다.

## 릴리스

`package.json` 버전과 일치하는 `v` 태그를 푸시하면 GitHub Actions가 macOS, Linux, Windows에서 x64·ARM64 압축본을 빌드하고 실행을 검사합니다. 검사를 통과하면 GitHub Release에 압축본, npm 패키지, 설치 스크립트, 체크섬, Homebrew 공식과 Nix flake를 게시합니다. 알파 태그는 GitHub 사전 릴리스로 표시합니다. 태그 없이 수동 실행하면 빌드 결과를 Actions에서 확인할 수 있습니다. [릴리스 워크플로](.github/workflows/release.yml)

npm 자동 게시에는 `@info-sec-pi/isp`의 Trusted Publisher를 대상 저장소의 `release.yml`로 등록하고 저장소 변수 `PUBLISH_NPM=true`를 설정합니다. 패키지의 첫 공개가 필요한 경우 npm 계정에서 초기 버전을 게시한 뒤 연결합니다. 워크플로는 알파 버전을 npm `alpha` 태그에 게시합니다. [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)

Pi 라이선스의 원문은 `licenses/pi-MIT.txt`에 있습니다. 기반 라이브러리의 소스와 SDK 문서는 [Pi 1.6.0 저장소](https://github.com/earendil-works/pi/tree/v1.6.0)에 있습니다. 의존성 버전과 무결성 값은 [Pi 공식 설치용 잠금 파일](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/install-lock/package-lock.json)에서 가져왔습니다.
