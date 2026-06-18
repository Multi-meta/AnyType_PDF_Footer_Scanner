#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>
#include <filesystem>
#include <cstdio>
#include <ctime>
#include <stdexcept>
#include <dirent.h>

namespace fs = std::filesystem;

// ── CONFIG ────────────────────────────────────────────────────────────────────

// Target text to look for in footers (UTF-8 encoded Hindi)
const std::string TARGET_TEXT = "प्रपत्र - 1 (अंतिम प्रकाशन 2026)";

// Number of lines from the BOTTOM of each page to treat as footer
const int FOOTER_LINES = 10;


// ── HELPERS ───────────────────────────────────────────────────────────────────

// Run a shell command and capture its stdout
std::string exec_command(const std::string& cmd) {
    std::string result;
    char buffer[512];
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) throw std::runtime_error("popen() failed for: " + cmd);
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr)
        result += buffer;
    pclose(pipe);
    return result;
}

bool command_exists(const std::string& command) {
#ifdef _WIN32
    std::string cmd = "where " + command + " >nul 2>nul";
#else
    std::string cmd = "command -v " + command + " >/dev/null 2>&1";
#endif
    return system(cmd.c_str()) == 0;
}

std::string stderr_to_null() {
#ifdef _WIN32
    return " 2>nul";
#else
    return " 2>/dev/null";
#endif
}

// Normalize whitespace: collapse multiple spaces/tabs into one, trim ends
std::string normalize(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    bool last_space = true;
    for (unsigned char c : s) {
        if (c == ' ' || c == '\t' || c == '\r') {
            if (!last_space) { out += ' '; last_space = true; }
        } else {
            out += static_cast<char>(c);
            last_space = false;
        }
    }
    // rtrim
    while (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

std::string compact_for_match(const std::string& s) {
    std::string out;
    out.reserve(s.size());

    for (unsigned char c : s) {
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') continue;
        if (c == '-' || c == '_' || c == '(' || c == ')' || c == '[' || c == ']') continue;
        if (c == '{' || c == '}' || c == ',' || c == '.' || c == ':' || c == ';') continue;
        if (c == '\'' || c == '"' || c == '`' || c == '|' || c == '<' || c == '>') continue;
        out += static_cast<char>(c);
    }

    return out;
}

bool footer_matches_target(const std::string& footer) {
    std::string compact_footer = compact_for_match(footer);
    std::string compact_target = compact_for_match(TARGET_TEXT);

    if (compact_footer.find(compact_target) != std::string::npos) {
        return true;
    }

    const std::vector<std::string> required_tokens = {
        "प्रपत्र",
        "अंतिम",
        "प्रकाशन",
        "2026"
    };

    for (const auto& token : required_tokens) {
        if (compact_footer.find(compact_for_match(token)) == std::string::npos) {
            return false;
        }
    }

    return true;
}

// Split a string by delimiter character, return vector of lines
std::vector<std::string> split_lines(const std::string& text, char delim = '\n') {
    std::vector<std::string> lines;
    std::istringstream ss(text);
    std::string line;
    while (std::getline(ss, line, delim))
        lines.push_back(line);
    return lines;
}

// ── OCR HELPERS (Tesseract) ──────────────────────────────────────────────────

// Extract specific pages from PDF as images using pdftoppm
std::vector<std::string> extract_pages_as_images(const std::string& pdf_path, int start_page, int end_page, const std::string& temp_dir) {
    std::vector<std::string> image_files;
    
    try {
        if (!command_exists("pdftoppm")) {
            std::cerr << "pdftoppm was not found. Install Poppler and add it to PATH.\n";
            return image_files;
        }

        // Create temp directory if it doesn't exist
        if (!fs::exists(temp_dir)) {
            fs::create_directories(temp_dir);
        }

        // pdftoppm converts PDF to PPM images: pdftoppm input.pdf output_prefix -f start -l end
        std::string output_prefix = temp_dir + "/page";
        std::string cmd = "pdftoppm \"" + pdf_path + "\" \"" + output_prefix + "\" -f " 
                        + std::to_string(start_page) + " -l " + std::to_string(end_page) 
                        + " -png" + stderr_to_null();
        
        int result = system(cmd.c_str());
        if (result != 0) {
            return image_files;  // pdftoppm failed
        }

        for (const auto& entry : fs::directory_iterator(temp_dir)) {
            if (!entry.is_regular_file()) continue;

            std::string ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            if (ext == ".png") {
                image_files.push_back(entry.path().string());
            }
        }

        std::sort(image_files.begin(), image_files.end());
    } catch (const std::exception& e) {
        std::cerr << "Error extracting pages as images: " << e.what() << "\n";
    }

    return image_files;
}

// Run Tesseract OCR on an image file and return extracted text
std::string run_tesseract_ocr(const std::string& image_path) {
    try {
        std::string text;
        const std::vector<int> psm_modes = {6, 11, 12};

        for (int psm : psm_modes) {
            std::string output_file = image_path + "_ocr_psm_" + std::to_string(psm);

            // Hindi + English OCR because the footer is in Devanagari.
            std::string cmd = "tesseract \"" + image_path + "\" \"" + output_file
                            + "\" -l hin+eng --psm " + std::to_string(psm)
                            + stderr_to_null();
            int result = system(cmd.c_str());
            if (result != 0) {
                continue;
            }

            std::string text_file = output_file + ".txt";
            std::ifstream file(text_file);
            if (file.is_open()) {
                std::stringstream buffer;
                buffer << file.rdbuf();
                std::string mode_text = buffer.str();
                file.close();

                if (!mode_text.empty()) {
                    text += "\n" + mode_text;
                }
            }

            fs::remove(text_file);
        }

        fs::remove(image_path);
        
        return text;
    } catch (const std::exception& e) {
        std::cerr << "Error running Tesseract: " << e.what() << "\n";
        return "";
    }
}

// Extract footer text from PDF using OCR (for scanned PDFs)
std::string extract_footer_ocr(const std::string& pdf_path, int total_pages) {
    std::string footer_text;
    
    try {
        // Extract ONLY the LAST page for OCR (to save time)
        int last_page = total_pages;
        
        // Create temp directory
        std::string temp_dir = fs::temp_directory_path().string() + "/pdf_ocr_temp";
        
        // Extract only last page as image
        auto images = extract_pages_as_images(pdf_path, last_page, last_page, temp_dir);
        
        // Run Tesseract on the last page
        for (const auto& img : images) {
            std::string page_text = run_tesseract_ocr(img);
            if (!page_text.empty()) {
                auto lines = split_lines(page_text);
                int start = std::max(0, (int)lines.size() - FOOTER_LINES);
                for (int i = start; i < (int)lines.size(); ++i) {
                    std::string trimmed = normalize(lines[i]);
                    if (!trimmed.empty()) {
                        footer_text += trimmed + " ";
                    }
                }
            }
        }

        // Clean up temp directory
        try {
            fs::remove_all(temp_dir);
        } catch (...) {}
        
    } catch (const std::exception& e) {
        std::cerr << "Error in OCR extraction: " << e.what() << "\n";
    }

    return footer_text;
}

// Extract footer text from a single page's text block.
// pdftotext separates pages with \f (form feed).
// We take the last FOOTER_LINES non-empty lines as "footer".
std::string extract_footer(const std::string& page_text) {
    auto lines = split_lines(page_text);
    // Collect non-empty lines
    std::vector<std::string> non_empty;
    for (const auto& l : lines) {
        std::string trimmed = normalize(l);
        if (!trimmed.empty())
            non_empty.push_back(trimmed);
    }
    // Take last FOOTER_LINES lines
    int start = std::max(0, (int)non_empty.size() - FOOTER_LINES);
    std::string footer;
    for (int i = start; i < (int)non_empty.size(); ++i) {
        if (!footer.empty()) footer += ' ';
        footer += non_empty[i];
    }
    return footer;
}

// Get current timestamp as string
std::string current_timestamp() {
    std::time_t now = std::time(nullptr);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%d %b %Y, %I:%M %p", std::localtime(&now));
    return std::string(buf);
}

// Get total page count from PDF
int get_pdf_page_count(const std::string& pdf_path) {
    try {
        // Method 1: Try pdfinfo first
        if (command_exists("pdfinfo")) {
            std::string cmd = "pdfinfo \"" + pdf_path + "\" 2>&1";
            std::string output = exec_command(cmd);
            
            // Parse output to find "Pages:" line
            std::istringstream iss(output);
            std::string line;
            while (std::getline(iss, line)) {
                if (line.find("Pages:") != std::string::npos) {
                    size_t pos = line.find(':');
                    if (pos != std::string::npos) {
                        std::string pages_str = line.substr(pos + 1);
                        // Trim whitespace
                        pages_str.erase(0, pages_str.find_first_not_of(" \t"));
                        pages_str.erase(pages_str.find_last_not_of(" \t") + 1);
                        try {
                            int count = std::stoi(pages_str);
                            if (count > 0) return count;
                        } catch (...) {}
                    }
                }
            }
        }

        if (!command_exists("pdftoppm")) {
            return 0;
        }
        
        // Method 2: If pdfinfo fails, try to extract a single page with pdftoppm to test
        // If successful, we know it has at least 1 page; assume reasonable default
        std::string temp_dir = fs::temp_directory_path().string() + "/pdf_info_temp";
        if (!fs::exists(temp_dir)) {
            fs::create_directories(temp_dir);
        }
        
        std::string test_cmd = "pdftoppm \"" + pdf_path + "\" \"" + temp_dir + "/test\" -f 1 -l 1 -png 2>&1";
        std::string test_output = exec_command(test_cmd);
        
        // Check if the page was extracted
        std::string test_file = temp_dir + "/test-01.png";
        if (fs::exists(test_file)) {
            // Clean up
            try {
                fs::remove_all(temp_dir);
            } catch (...) {}
            
            // If page 1 exists, assume at least 5 pages or extract all to get actual count
            // Try to extract all pages and count them
            std::string count_dir = fs::temp_directory_path().string() + "/pdf_count_temp";
            if (!fs::exists(count_dir)) {
                fs::create_directories(count_dir);
            }
            
            std::string extract_all = "pdftoppm \"" + pdf_path + "\" \"" + count_dir + "/p\" -png 2>&1";
            exec_command(extract_all);
            
            int page_count = 0;
            for (int i = 1; i <= 1000; ++i) {  // Reasonable upper limit
                std::string page_file = count_dir + "/p-";
                if (i < 10) page_file += "0";
                if (i < 100) page_file += "0";
                page_file += std::to_string(i) + ".png";
                
                if (fs::exists(page_file)) {
                    page_count = i;
                } else {
                    break;
                }
            }
            
            // Clean up
            try {
                fs::remove_all(count_dir);
            } catch (...) {}
            
            if (page_count > 0) return page_count;
            return 1;
        }
        
        // Clean up
        try {
            fs::remove_all(temp_dir);
        } catch (...) {}
        
    } catch (...) {}
    
    return 0;
}


// ── DATA TYPES ────────────────────────────────────────────────────────────────

struct ScanResult {
    std::string path;
    std::string name;
    bool        found        = false;
    int         total_pages  = 0;
    std::vector<int> matched_pages;
    std::string error;
};


// ── CORE SCAN ─────────────────────────────────────────────────────────────────

ScanResult scan_pdf(const fs::path& pdf_path) {
    ScanResult res;
    res.path = pdf_path.string();
    res.name = pdf_path.filename().string();

    try {
        // Get total page count first
        int total_pages = get_pdf_page_count(pdf_path.string());
        res.total_pages = total_pages;

        // Use pdftotext to extract text; -layout preserves spatial layout
        std::string full_text;
        if (command_exists("pdftotext")) {
            std::string cmd = "pdftotext -layout \"" + pdf_path.string() + "\" -" + stderr_to_null();
            full_text = exec_command(cmd);
        }

        // If pdftotext fails or returns empty (scanned PDF), fall back to OCR
        if (full_text.empty()) {
            std::cout << "\n    🔄 Scanned PDF detected, trying OCR with Tesseract... ";
            
            if (total_pages <= 0) {
                res.error = "Unable to determine page count from PDF";
                std::cout << "⚠️  " << res.error << "\n";
                return res;
            }

            // Extract footer using OCR
            std::string footer = extract_footer_ocr(pdf_path.string(), total_pages);
            
            if (footer.empty()) {
                res.error = "OCR extraction failed (no text recognized)";
                std::cout << "❌ " << res.error << "\n";
                return res;
            }
            
            std::cout << "✅ OCR succeeded\n";
            
            if (footer_matches_target(footer)) {
                res.found = true;
                res.matched_pages.push_back(total_pages);  // Footer likely on last page
            }
            return res;
        }

        // Split into per-page blocks (pdftotext separates pages with \f)
        std::vector<std::string> pages;
        {
            std::string page;
            for (char c : full_text) {
                if (c == '\f') {
                    pages.push_back(page);
                    page.clear();
                } else {
                    page += c;
                }
            }
            if (!page.empty()) pages.push_back(page);
        }

        // Update total_pages from actual extraction
        if (!pages.empty() && pages.size() != (size_t)total_pages) {
            res.total_pages = static_cast<int>(pages.size());
        }

        // CHECK ONLY THE LAST PAGE
        if (!pages.empty()) {
            int last_page_idx = pages.size() - 1;
            std::string footer = extract_footer(pages[last_page_idx]);
            if (footer_matches_target(footer)) {
                res.found = true;
                res.matched_pages.push_back(last_page_idx + 1);  // 1-indexed
            }
        }

    } catch (const std::exception& e) {
        res.error = std::string(e.what());
    }

    return res;
}

std::vector<ScanResult> scan_folder(const fs::path& folder) {
    std::vector<ScanResult> results;

    // Collect all .pdf files, sorted alphabetically
    std::vector<fs::path> pdfs;
    for (const auto& entry : fs::directory_iterator(folder)) {
        if (entry.is_regular_file()) {
            std::string ext = entry.path().extension().string();
            // Case-insensitive .pdf check
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            if (ext == ".pdf")
                pdfs.push_back(entry.path());
        }
    }
    std::sort(pdfs.begin(), pdfs.end());

    if (pdfs.empty()) {
        std::cout << "⚠️  No PDF files found in: " << folder << "\n";
        return results;
    }

    for (const auto& pdf : pdfs) {
        std::cout << "  Scanning: " << pdf.filename().string() << " ... " << std::flush;
        ScanResult r = scan_pdf(pdf);
        if (!r.error.empty())
            std::cout << "⚠️  ERROR: " << r.error << "\n";
        else if (r.found)
            std::cout << "✅ FOUND\n";
        else
            std::cout << "❌ NOT FOUND\n";
        results.push_back(r);
    }

    return results;
}


void print_results(const std::vector<ScanResult>& results) {
    int found_count = 0, not_found_count = 0, error_count = 0;
    for (const auto& r : results) {
        if (!r.error.empty())      ++error_count;
        else if (r.found)          ++found_count;
        else                       ++not_found_count;
    }

    std::cout << "\n╔════════════════════════════════════════╗\n";
    std::cout << "║          SCAN SUMMARY                  ║\n";
    std::cout << "╚════════════════════════════════════════╝\n\n";
    std::cout << "Total PDFs:     " << results.size() << "\n";
    std::cout << "Found ✅:       " << found_count << "\n";
    std::cout << "Not Found ❌:   " << not_found_count << "\n";
    std::cout << "Errors ⚠️:      " << error_count << "\n\n";

    for (int i = 0; i < (int)results.size(); ++i) {
        const auto& r = results[i];
        std::cout << (i + 1) << ". " << r.name << " (" << r.total_pages << " pages)";

        if (!r.error.empty()) {
            std::cout << " - ⚠️ Error: " << r.error << "\n";
        } else if (r.found) {
            std::cout << " - ✅ Found on page(s): ";
            for (int j = 0; j < (int)r.matched_pages.size(); ++j) {
                if (j) std::cout << ", ";
                std::cout << r.matched_pages[j];
            }
            std::cout << "\n";
        } else {
            std::cout << " - ❌ Not found\n";
        }
    }
}


// ── MULTI-FILE SELECTION ──────────────────────────────────────────────────────

std::vector<ScanResult> scan_multiple_files(const std::vector<fs::path>& pdf_paths) {
    std::vector<ScanResult> results;

    if (pdf_paths.empty()) {
        std::cout << "⚠️  No PDF files provided.\n";
        return results;
    }

    for (const auto& pdf : pdf_paths) {
        std::cout << "  Scanning: " << pdf.filename().string() << " ... " << std::flush;
        ScanResult r = scan_pdf(pdf);
        if (!r.error.empty())
            std::cout << "⚠️  ERROR: " << r.error << "\n";
        else if (r.found)
            std::cout << "✅ FOUND\n";
        else
            std::cout << "❌ NOT FOUND\n";
        results.push_back(r);
    }

    return results;
}

// Interactive file selection - let user pick multiple PDFs
std::vector<fs::path> select_pdf_files() {
    std::vector<fs::path> selected;
    std::string input;

    std::cout << "\n📋 Enter PDF file paths (one per line, blank line to finish):\n";
    std::cout << "(You can use absolute or relative paths)\n\n";

    int count = 0;
    while (true) {
        std::cout << "  PDF #" << (count + 1) << ": ";
        std::getline(std::cin, input);

        // Trim whitespace
        input.erase(0, input.find_first_not_of(" \t\r\n"));
        input.erase(input.find_last_not_of(" \t\r\n") + 1);

        if (input.empty()) {
            if (count == 0) {
                std::cout << "⚠️  Please enter at least one PDF path.\n";
                continue;
            }
            break;  // Done entering files
        }

        fs::path pdf_path = fs::absolute(input);

        if (!fs::exists(pdf_path)) {
            std::cout << "    ❌ File not found: " << input << "\n";
            continue;
        }

        if (!fs::is_regular_file(pdf_path)) {
            std::cout << "    ❌ Not a file: " << input << "\n";
            continue;
        }

        std::string ext = pdf_path.extension().string();
        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        if (ext != ".pdf") {
            std::cout << "    ❌ Not a PDF file (extension: " << ext << ")\n";
            continue;
        }

        selected.push_back(pdf_path);
        std::cout << "    ✅ Added: " << pdf_path.filename().string() << "\n";
        count++;
    }

    return selected;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

int main(int argc, char* argv[]) {
    std::vector<ScanResult> results;
    std::string output_folder;

    // Check if a folder argument was provided
    if (argc > 1) {
        // Folder mode: scan all PDFs in folder
        std::string folder_str = argv[1];
        fs::path folder = fs::absolute(folder_str);

        if (!fs::is_directory(folder)) {
            std::cerr << "❌ Not a directory: " << folder << "\n";
            return 1;
        }

        std::cout << "\n📂 Scanning PDFs in: " << folder << "\n";
        std::cout << "Looking for: " << TARGET_TEXT << "\n\n";

        results = scan_folder(folder);
        output_folder = folder.string();
    } else {
        // Interactive mode: ask user to select multiple PDFs
        std::cout << "\n=== PDF Footer Scanner ===\n";
        std::cout << "Looking for: " << TARGET_TEXT << "\n";

        auto selected = select_pdf_files();
        if (selected.empty()) {
            std::cout << "❌ No PDF files selected.\n";
            return 1;
        }

        std::cout << "\n📂 Scanning " << selected.size() << " PDF file(s)...\n\n";
        results = scan_multiple_files(selected);

        // Use first file's directory as output location
        output_folder = selected[0].parent_path().string();
    }

    if (results.empty()) return 0;

    print_results(results);

    int found = 0;
    for (const auto& r : results) if (r.found) ++found;
    std::cout << "📊 Summary: " << found << "/" << results.size()
              << " PDFs contain the target footer text.\n\n";

    return 0;
}
