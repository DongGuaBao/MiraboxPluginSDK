#include <QFont>
#include <QFontInfo>
#include <QFontMetricsF>
#include <QGuiApplication>
#include <QByteArray>
#include <QFile>
#include <QHash>
#include <QString>
#include <QTextStream>
#include <QVector>

#include <algorithm>
#include <array>
#include <cmath>

namespace {
constexpr int kQuantum = 64;
constexpr int kPageSize = 256;

const std::array<const char*, 17> kFamilies{{
    "Segoe UI", "Arial", "Times New Roman", "Courier New", "Consolas",
    "Verdana", "Tahoma", "Georgia", "Microsoft Sans Serif",
    "Microsoft YaHei", "Microsoft YaHei UI", "SimSun",
    "Microsoft JhengHei", "Microsoft JhengHei UI", "Yu Gothic UI",
    "MS Gothic", "Malgun Gothic",
}};

QString quoted(const QString& value) {
    QString output = value;
    output.replace('\\', "\\\\").replace('"', "\\\"");
    return '"' + output + '"';
}

bool zeroWidthCategory(uint codePoint) {
    const auto category = QChar::category(codePoint);
    return category == QChar::Mark_NonSpacing ||
           category == QChar::Mark_Enclosing ||
           category == QChar::Other_Control ||
           category == QChar::Other_Format ||
           category == QChar::Other_Surrogate ||
           category == QChar::Separator_Line ||
           category == QChar::Separator_Paragraph;
}

int measuredWidth(const QFontMetricsF& metrics, uint codePoint, int defaultWidth) {
    if (zeroWidthCategory(codePoint)) return 0;
    if (QChar::category(codePoint) == QChar::Other_NotAssigned ||
        QChar::category(codePoint) == QChar::Other_PrivateUse)
        return defaultWidth;
    const QString text = QString::fromUcs4(&codePoint, 1);
    return std::clamp(qRound(metrics.horizontalAdvance(text)), 0, 254);
}

struct Page {
    enum Kind { Constant, Sparse, Dense } kind = Constant;
    int common = 0;
    QByteArray bytes;
};

Page packPage(const std::array<unsigned char, kPageSize>& widths) {
    std::array<int, 255> counts{};
    for (unsigned char width : widths) ++counts[width];
    const int common = static_cast<int>(
        std::max_element(counts.begin(), counts.end()) - counts.begin());
    const int exceptions = kPageSize - counts[common];
    Page page;
    page.common = common;
    if (!exceptions) return page;
    if (exceptions <= 64) {
        page.kind = Page::Sparse;
        page.bytes.reserve(exceptions * 2);
        for (int offset = 0; offset < kPageSize; ++offset) {
            if (widths[offset] == common) continue;
            page.bytes.append(static_cast<char>(offset));
            page.bytes.append(static_cast<char>(widths[offset]));
        }
        return page;
    }
    page.kind = Page::Dense;
    page.bytes = QByteArray(reinterpret_cast<const char*>(widths.data()), kPageSize);
    return page;
}

int internPage(const QByteArray& bytes, QVector<QString>& pageData, QHash<QString, int>& pageIds) {
    const QString encoded = QString::fromLatin1(bytes.toBase64());
    const auto existing = pageIds.constFind(encoded);
    if (existing != pageIds.constEnd()) return existing.value();
    const int id = pageData.size();
    pageData.push_back(encoded);
    pageIds.insert(encoded, id);
    return id;
}

bool writeFont(QTextStream& output, const QString& family,
               QVector<QString>& pageData, QHash<QString, int>& pageIds) {
    QFont font(family);
    font.setPixelSize(kQuantum);
    font.setWeight(QFont::Normal);
    font.setStyle(QFont::StyleNormal);
    const QFontInfo info(font);
    const QFontMetricsF metrics(font);
    if (info.family().isEmpty() || metrics.height() <= 0) return false;
    const int defaultWidth = std::clamp(qRound(metrics.horizontalAdvance("n")), 1, 254);
    const int spaceWidth = std::clamp(qRound(metrics.horizontalAdvance(" ")), 1, 254);
    QVector<Page> pages;
    pages.reserve(256);
    for (int pageIndex = 0; pageIndex < 256; ++pageIndex) {
        std::array<unsigned char, kPageSize> widths{};
        for (int offset = 0; offset < kPageSize; ++offset) {
            const uint codePoint = static_cast<uint>((pageIndex << 8) | offset);
            widths[offset] = static_cast<unsigned char>(measuredWidth(metrics, codePoint, defaultWidth));
        }
        pages.push_back(packPage(widths));
    }

    output << "  " << quoted(family) << ": {\n";
    output << "    resolvedFamily: " << quoted(info.family()) << ", exactMatch: "
           << (info.exactMatch() ? "true" : "false") << ", defaultWidth: "
           << defaultWidth << ", spaceWidth: " << spaceWidth << ",\n";
    output << "    constantRanges: [";
    bool first = true;
    for (int start = 0; start < pages.size();) {
        if (pages[start].kind != Page::Constant) { ++start; continue; }
        int end = start;
        while (end + 1 < pages.size() && pages[end + 1].kind == Page::Constant &&
               pages[end + 1].common == pages[start].common) ++end;
        if (!first) output << ',';
        output << '[' << start << ',' << end << ',' << pages[start].common << ']';
        first = false;
        start = end + 1;
    }
    output << "],\n    sparsePages: {";
    first = true;
    for (int index = 0; index < pages.size(); ++index) {
        if (pages[index].kind != Page::Sparse) continue;
        if (!first) output << ',';
        output << index << ":[" << pages[index].common << ','
               << internPage(pages[index].bytes, pageData, pageIds) << ']';
        first = false;
    }
    output << "},\n    densePages: {";
    first = true;
    for (int index = 0; index < pages.size(); ++index) {
        if (pages[index].kind != Page::Dense) continue;
        if (!first) output << ',';
        output << index << ':' << internPage(pages[index].bytes, pageData, pageIds);
        first = false;
    }
    output << "}\n  },\n";
    return true;
}

bool writeValidation(const QString& path) {
    const std::array<const char*, 18> samples{{
        "Hello", "StreamDock", "AVATAR", "To Wa Yo", "iiiiiiii", "WWWWWWWW",
        "0123456789", "Power Request", "100% CPU", "Hello, world!",
        u8"你好世界", u8"微软雅黑测试", u8"中文 ABC 123", u8"日本語テスト",
        u8"한글 테스트", u8"繁體中文測試", u8"（）【】，。！？", u8"A中B文C",
    }};
    QVector<QString> sampleTexts;
    sampleTexts.reserve(static_cast<int>(samples.size()) + 200);
    for (const char* sample : samples) sampleTexts.push_back(QString::fromUtf8(sample));
    const QString alphabet = QStringLiteral("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz 0123456789,.-");
    quint32 randomState = 0x6d2b79f5u;
    for (int sampleIndex = 0; sampleIndex < 200; ++sampleIndex) {
        QString text;
        const int length = 4 + sampleIndex % 21;
        text.reserve(length);
        for (int characterIndex = 0; characterIndex < length; ++characterIndex) {
            randomState = randomState * 1664525u + 1013904223u;
            text.append(alphabet.at(static_cast<int>(randomState % alphabet.size())));
        }
        sampleTexts.push_back(text);
    }
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) return false;
    QTextStream output(&file);
    output.setCodec("UTF-8");
    output.setRealNumberNotation(QTextStream::FixedNotation);
    output.setRealNumberPrecision(6);
    for (const char* familyName : kFamilies) {
        const QString family = QString::fromUtf8(familyName);
        QFont font(family);
        font.setPixelSize(kQuantum);
        font.setWeight(QFont::Normal);
        font.setStyle(QFont::StyleNormal);
        const QFontMetricsF metrics(font);
        for (const QString& text : sampleTexts) {
            output << QString::fromLatin1(family.toUtf8().toBase64()) << '\t'
                   << QString::fromLatin1(text.toUtf8().toBase64()) << '\t'
                   << metrics.horizontalAdvance(text) << '\n';
        }
    }
    return true;
}
} // namespace

int main(int argc, char* argv[]) {
    QGuiApplication application(argc, argv);
    if (argc == 3 && QByteArray(argv[1]) == "--validate")
        return writeValidation(QString::fromLocal8Bit(argv[2])) ? 0 : 5;
    if (argc != 2) return 2;
    QFile file(QString::fromLocal8Bit(argv[1]));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) return 3;
    QTextStream output(&file);
    output.setCodec("UTF-8");
    output << "// Generated by tools/font-width-generator. Do not edit manually.\n";
    output << "export const FONT_WIDTH_QUANTUM = " << kQuantum << " as const;\n";
    output << "export interface PackedFontWidth { readonly resolvedFamily: string; readonly exactMatch: boolean; readonly defaultWidth: number; readonly spaceWidth: number; readonly constantRanges: readonly (readonly [number, number, number])[]; readonly sparsePages: Readonly<Record<number, readonly [number, number]>>; readonly densePages: Readonly<Record<number, number>>; }\n";
    output << "export const FONT_WIDTH_TABLES: Readonly<Record<string, PackedFontWidth>> = {\n";
    QVector<QString> pageData;
    QHash<QString, int> pageIds;
    for (const char* family : kFamilies)
        if (!writeFont(output, QString::fromUtf8(family), pageData, pageIds)) return 4;
    output << "};\n";
    output << "export const FONT_WIDTH_PAGE_DATA: readonly string[] = [\n";
    for (const QString& encoded : pageData) output << "  " << quoted(encoded) << ",\n";
    output << "];\n";
    return 0;
}
