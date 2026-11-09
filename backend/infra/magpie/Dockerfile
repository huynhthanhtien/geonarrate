FROM ubuntu:24.04 AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates cmake git git-lfs ninja-build
WORKDIR /src
RUN GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v0.3.0 \
    https://github.com/NVIDIA/NeMo-Speech.cpp.git nemo \
 && git -C nemo submodule update --init --recursive --depth 1 --jobs 4 \
    llama.cpp third_party/cpp-httplib third_party/open_jtalk third_party/cppjieba \
 && git -C nemo lfs install --local \
 && git -C nemo lfs pull
RUN cmake -S nemo -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/opt/nemo -DGGML_NATIVE=OFF \
    -DNEMO_SPEECH_BUILD_ASR=OFF -DNEMO_SPEECH_BUILD_DIAR=OFF \
    -DNEMO_SPEECH_BUILD_MIC_CAPTURE=OFF -DNEMO_SPEECH_BUILD_HTTP=ON \
    -DNEMO_SPEECH_TTS_WITH_JA=ON -DNEMO_SPEECH_TTS_WITH_ZH=ON \
 && cmake --build build --parallel 4 \
 && cmake --install build

FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libgomp1 libstdc++6 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 nemo \
 && install -d -o nemo -g nemo /var/lib/nemo/models
COPY --from=build /opt/nemo /opt/nemo
ENV NEMO_SPEECH_MODEL_DIR=/var/lib/nemo/models
USER nemo
CMD ["/bin/sh", "-ec", "/opt/nemo/bin/nemo-speech pull magpie && exec /opt/nemo/bin/nemo-speech serve --tts-model magpie --device cpu --host 0.0.0.0 --port 8080 --no-ui"]
