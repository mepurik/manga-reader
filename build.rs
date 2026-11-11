fn main() {
    println!("cargo:rerun-if-changed=icon.ico");
    let mut res = winres::WindowsResource::new();
    res.set_icon("icon.ico");
    let _ = res.compile();
}
