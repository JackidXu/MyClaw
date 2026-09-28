// 剪映(VideoFusion)Mac 版草稿本地解密工具 v3
// 思路：绕过 app 全局密钥注册表，直接用 ICryptoKeyStore::create(path, usage)
//       构建一个“新鲜”密钥库（从 path 目录读取 crypto_key_store.dat），
//       再调用其虚函数 queryKey(path, uri) 取出密钥串，
//       最后用 EncryptUtils::decrypt(input, key) 解密。
// 注：create 返回 shared_ptr<ICryptoKeyStore>（16字节，布局 {ptr,ctrl}），
//     queryKey 是该类的第 11 个虚函数（vtable 偏移 0x50）。

#include <cstdio>
#include <cstdlib>
#include <string>
#include <fstream>
#include <sstream>
#include <iostream>

// 解密（静态成员，this 被忽略）
namespace lvve {
    enum ICryptoKeyStoreUsage { kUsageDraft = 0, kUsageTemplate = 1, kUsageOther = 2 };
    class ICryptoKeyStore {
    public:
        // create 返回 shared_ptr<ICryptoKeyStore>（sret 在 x0）
        struct SP { void* ptr; void* ctrl; };
        static SP create(const std::string& path, ICryptoKeyStoreUsage usage);
    };
    class EncryptUtils {
    public:
        static std::string decrypt(const std::string& input, const std::string& key);
    };
}

typedef void (*QueryKeyFn)(std::string* ret, void* self, const std::string& path, const std::string& uri);

static std::string read_file(const std::string& p) {
    std::ifstream f(p, std::ios::binary);
    std::ostringstream ss; ss << f.rdbuf(); return ss.str();
}
static bool write_file(const std::string& p, const std::string& d) {
    std::ofstream f(p, std::ios::binary);
    if (!f) return false;
    f.write(d.data(), (std::streamsize)d.size());
    return true;
}
static std::string b64decode(const std::string& in) {
    static const std::string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    auto idx = [&](char c)->int { if (c=='=') return 0; size_t p=chars.find(c); return p==std::string::npos?-1:(int)p; };
    std::string out; int val=0,bits=0;
    for (char c:in){ if(c==' '||c=='\n'||c=='\r'||c=='\t')continue; int v=idx(c); if(v<0)continue;
        val=(val<<6)|v; bits+=6; if(bits>=8){bits-=8; out.push_back((char)((val>>bits)&0xFF));} }
    return out;
}
static void dump_hex(const std::string& s, const char* tag){ fprintf(stderr,"[%s] len=%zu\n",tag,s.size()); }

int main(int argc, char** argv) {
    if (argc < 4) { fprintf(stderr,"用法: %s <draftDir> <uri> <usage> [--raw] [--out <f>]\n",argv[0]); return 2; }
    std::string draftDir=argv[1], uri=argv[2];
    int usage = atoi(argv[3]);
    bool raw=false; std::string outPath;
    for(int i=4;i<argc;i++){ std::string a=argv[i];
        if(a=="--raw") raw=true; else if(a=="--out"&&i+1<argc) outPath=argv[++i]; }
    if(outPath.empty()) outPath=draftDir+"/draft_content.plain.json";

    lvve::ICryptoKeyStore::SP s = lvve::ICryptoKeyStore::create(draftDir, (lvve::ICryptoKeyStoreUsage)usage);
    fprintf(stderr,"create -> SP.ptr=%p ctrl=%p\n", s.ptr, s.ctrl);
    if(!s.ptr){ fprintf(stderr,"create 返回 null\n"); return 5; }

    void** vtable = *(void***)s.ptr;
    QueryKeyFn qk = (QueryKeyFn)vtable[10];   // vtable 偏移 0x50
    fprintf(stderr,"vtable[10]=%p\n", (void*)qk);
    std::string key;
    qk(&key, s.ptr, draftDir, uri);
    dump_hex(key,"KEY");
    if(key.empty()){ fprintf(stderr,"密钥为空\n"); return 4; }

    std::string content=read_file(draftDir+"/draft_content.json");
    fprintf(stderr,"content len=%zu\n",content.size());
    std::string to_dec=content; if(raw) to_dec=b64decode(content);
    std::string plain = lvve::EncryptUtils::decrypt(to_dec, key);
    fprintf(stderr,"plain len=%zu\n",plain.size());
    if(!plain.empty()){
        fprintf(stderr,"plain head: ");
        for(size_t i=0;i<40&&i<plain.size();i++) fprintf(stderr,"%c",plain[i]>=32&&plain[i]<127?plain[i]:'.');
        fprintf(stderr,"\n");
    }
    if(plain.empty()){ fprintf(stderr,"解密失败\n"); return 1; }
    if(!write_file(outPath,plain)){ fprintf(stderr,"写失败: %s\n",outPath.c_str()); return 1; }
    fprintf(stderr,"解密成功 -> %s\n",outPath.c_str());
    return 0;
}
