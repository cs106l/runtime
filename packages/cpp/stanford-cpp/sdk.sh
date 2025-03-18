#!/bin/bash

#
# Get WASI SDK
#

export WASI_SDK_VERSION=25
export HOST_PLATFORM="x86_64-linux"
export WASI_SDK_PATH=$(pwd)/wasi-sdk

curl -LO "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/wasi-sdk-${WASI_SDK_VERSION}.0-${HOST_PLATFORM}.tar.gz"
tar xf "wasi-sdk-${WASI_SDK_VERSION}.0-${HOST_PLATFORM}.tar.gz"
mv "wasi-sdk-${WASI_SDK_VERSION}.0-${HOST_PLATFORM}" wasi-sdk
rm "wasi-sdk-${WASI_SDK_VERSION}.0-${HOST_PLATFORM}.tar.gz"

#
# Get Stanford libraries
#

git submodule update --init --depth 1 src


# Here's my thoughts
#
#   Goal: Compile static archive at bundle time with 106B libraries
#
#   0. We will unfortunately need to move CS106B libraries into their own repo for fine-tuning, e.g. cs106l/stanford-cpp
#       - The dependence on Qt is too strong, even for some fairly innocuous functions
#       - However, most of the important stuff it looks like can be copy pasted
#   1. In manifest.ts, we will glob the sources and include paths, saving them to the outputted manifest file
#   2. Then build.sh will run, which will take these globs and compile every source file listed in sources using wasi-sdk,
#      ultimately producing an archive (.a) file into the package root
#       - Must pass both source file with -c flag to compiler as well as all include paths
#   3. Then just need to make sure that headers are copied over to package root (can use `files` param in Manifest)
#   4. On frontend, host must pass include paths to compiler, and the archive to the linker
#
# Pros:
#   - Do more work ahead of time compiling, minimal time spent compiling libraries on frontend
#   - Much simpler to orchestrate on frontend, since most heavy lifting done on backend (this)
#   - Matches what already is done for the C++ standard libraries
#
# Cons (compared to compiling library on frontend):
#   - Lose out on opportunities to lazily/selectively compile only the sources you need
#       - However figuring out which sources are needed is tricky, tracing through headers/doing the compiler's work
#       - Potentially larger binary sizes? However, the inclusion of .cpp in the fs probably larger than built archive (.a)
#   - Slower? Depends on network speed... we are trading potential cuts to compilation time in favor of download speed
#   - If libraries have dependencies, then we need to set up proper environment here at bundle time to make sure dependencies are satisfied
#
#   Right now, don't worry about abstracting this. Focus hard on 106B libraries, can abstract later
#   This may end up being the only cpp library we work on :->
#