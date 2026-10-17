package inex;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * INEX per-player skin agent (Max FPS Optimized with Reflection Caching & Offline Self-Skin Mode).
 */
public class InexSkinAgent {
    static final String DB = System.getProperty("inex.skin.db",
            "https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/");
    static final boolean ONLINE_SYNC = !"false".equalsIgnoreCase(System.getProperty("inex.skin.online", "true"));
    static final String SELF_USER = System.getProperty("inex.skin.self", "").toLowerCase(Locale.ROOT).trim();
    static final String SELF_FILE = System.getProperty("inex.skin.selfFile", "").trim();
    static final String SELF_MODEL = System.getProperty("inex.skin.selfModel", "slim").trim();

    static Instrumentation INST;
    static final Set<String> LOGGED = Collections.synchronizedSet(new HashSet<String>());
    static final Map<String, Entry> CACHE = new ConcurrentHashMap<String, Entry>();
    static final Map<Object, String> APPLIED = Collections.synchronizedMap(new WeakHashMap<Object, String>());
    static final Map<String, Method> METHOD_CACHE = new ConcurrentHashMap<String, Method>();

    static Class<?> mcClass;
    static ClassLoader cl;
    static Method getInstance;
    static Class<?> nativeImageCls, dynTexCls, identCls;

    static class Entry {
        volatile boolean fetching;
        volatile long fetchedAt;
        volatile long updatedAt;
        volatile String model;
        volatile byte[] png;
    }

    public static void premain(String args, Instrumentation inst) {
        INST = inst;
        preloadSelfLocalSkin();
        Thread t = new Thread(new Runnable() {
            public void run() { loop(); }
        }, "inex-skin-agent");
        t.setDaemon(true);
        t.start();
        log("agent started | onlineSync=" + ONLINE_SYNC + " | self=" + SELF_USER);
    }

    static void preloadSelfLocalSkin() {
        if (SELF_USER.isEmpty() || SELF_FILE.isEmpty()) return;
        try {
            File f = new File(SELF_FILE);
            if (!f.isFile() || f.length() < 64) return;
            byte[] data = readAllBytes(new FileInputStream(f));
            Entry en = new Entry();
            en.fetching = false;
            en.fetchedAt = System.currentTimeMillis();
            en.updatedAt = f.lastModified() > 0 ? f.lastModified() : 1L;
            en.model = SELF_MODEL.isEmpty() ? "slim" : SELF_MODEL;
            en.png = data;
            CACHE.put(SELF_USER, en);
            log("loaded local self-skin for " + SELF_USER + " (" + data.length + " bytes)");
        } catch (Throwable t) {
            logOnce("local self-skin load error: " + t);
        }
    }

    static void log(String s) { System.out.println("[INEX SKIN] " + s); }
    static void logOnce(String s) { if (LOGGED.add(s)) log(s); }

    static void loop() {
        while (true) {
            try { tick(); } catch (Throwable e) { logOnce("tick error: " + e); }
            try { Thread.sleep(2000L); } catch (InterruptedException e) { return; }
        }
    }

    static boolean init() {
        if (mcClass == null) {
            for (Class<?> c : INST.getAllLoadedClasses()) {
                if (c.getName().equals("net.minecraft.client.Minecraft")) { mcClass = c; break; }
            }
            if (mcClass == null) return false;
            cl = mcClass.getClassLoader();
            for (Method m : mcClass.getDeclaredMethods()) {
                if (Modifier.isStatic(m.getModifiers()) && m.getParameterTypes().length == 0
                        && m.getReturnType() == mcClass && m.getName().equals("getInstance")) {
                    getInstance = m;
                    m.setAccessible(true);
                }
            }
        }
        if (getInstance == null) return false;
        if (nativeImageCls == null) nativeImageCls = load("com.mojang.blaze3d.platform.NativeImage");
        if (dynTexCls == null) dynTexCls = load("net.minecraft.client.renderer.texture.DynamicTexture");
        if (identCls == null) identCls = load("net.minecraft.resources.Identifier", "net.minecraft.resources.ResourceLocation");
        return nativeImageCls != null && dynTexCls != null && identCls != null;
    }

    static Class<?> load(String... names) {
        for (String n : names) {
            try { return Class.forName(n, false, cl); } catch (Throwable ignore) {}
        }
        return null;
    }

    static void tick() throws Exception {
        if (!init()) return;
        final Object mc = getInstance.invoke(null);
        if (mc == null) return;
        Object conn = call(mc, "getConnection");
        if (conn == null) return;
        Object col = call(conn, "getOnlinePlayers");
        if (!(col instanceof Collection)) return;
        for (Object pi : new ArrayList<Object>((Collection<?>) col)) {
            try { handle(mc, pi); } catch (Throwable e) { logOnce("handle error: " + e); }
        }
    }

    static void handle(final Object mc, final Object pi) throws Exception {
        String name = profileName(call(pi, "getProfile"));
        if (name == null) return;
        final String key = name.toLowerCase(Locale.ROOT);

        // When Online Skin Sync is OFF: ignore all other players (they stay Steve/Alex) & only apply local self-skin!
        if (!ONLINE_SYNC) {
            if (!key.equals(SELF_USER)) return;
            if (!CACHE.containsKey(SELF_USER)) preloadSelfLocalSkin();
        } else {
            maybeFetch(key);
        }

        final Entry e = CACHE.get(key);
        if (e == null || e.png == null) return;
        final String stamp = key + ":" + e.updatedAt;
        if (stamp.equals(APPLIED.get(pi))) return;
        APPLIED.put(pi, stamp);
        Method exec = getCachedMethod(mc.getClass(), "execute", Runnable.class);
        exec.invoke(mc, new Runnable() {
            public void run() {
                try {
                    apply(mc, pi, key, e);
                    log("skin applied: " + key + (ONLINE_SYNC ? " (online)" : " (local-only)"));
                } catch (Throwable t) {
                    APPLIED.remove(pi);
                    logOnce("apply failed for " + key + ": " + t);
                }
            }
        });
    }

    static void maybeFetch(final String key) {
        Entry old = CACHE.get(key);
        long now = System.currentTimeMillis();
        if (old != null) {
            if (old.fetching) return;
            if (now - old.fetchedAt < (old.png == null ? 30000L : 90000L)) return;
        }
        final Entry en = old != null ? old : new Entry();
        en.fetching = true;
        en.fetchedAt = now;
        CACHE.put(key, en);
        Thread t = new Thread(new Runnable() {
            public void run() {
                try { fetch(key, en); }
                catch (Throwable ex) { logOnce("firebase fetch failed (" + key + "): " + ex); }
                finally { en.fetchedAt = System.currentTimeMillis(); en.fetching = false; }
            }
        }, "inex-skin-fetch");
        t.setDaemon(true);
        t.start();
    }

    static void fetch(String key, Entry en) throws Exception {
        String base = DB.endsWith("/") ? DB : (DB + "/");
        URL url = URI.create(base + URLEncoder.encode(key, "UTF-8") + ".json").toURL();
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(5000);
        c.setReadTimeout(8000);
        c.setRequestProperty("User-Agent", "INEX-Skin-Agent");
        if (c.getResponseCode() != 200) return;
        String body = new String(readAllBytes(c.getInputStream()), "UTF-8");
        if (body.trim().equals("null")) return;
        String b64 = jsonString(body, "skin");
        if (b64 == null || b64.isEmpty()) return;
        byte[] png = Base64.getDecoder().decode(b64);
        String model = jsonString(body, "model");
        String upd = jsonRaw(body, "updatedAt");
        long u = 1L;
        try { if (upd != null) u = Long.parseLong(upd.trim()); } catch (Exception ignore) {}
        en.model = model;
        en.updatedAt = u;
        en.png = png;
    }

    static byte[] readAllBytes(InputStream in) throws Exception {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } finally { in.close(); }
    }

    static String jsonString(String json, String field) {
        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? unescape(m.group(1)) : null;
    }

    static String jsonRaw(String json, String field) {
        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*(-?\\d+)").matcher(json);
        return m.find() ? m.group(1) : null;
    }

    static String unescape(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch != '\\' || i + 1 >= s.length()) { sb.append(ch); continue; }
            char n = s.charAt(++i);
            if (n == 'u' && i + 4 < s.length()) {
                sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                i += 4;
            } else if (n == 'n') sb.append('\n');
            else if (n == 'r') sb.append('\r');
            else if (n == 't') sb.append('\t');
            else sb.append(n);
        }
        return sb.toString();
    }

    static void apply(Object mc, Object pi, String key, Entry e) throws Exception {
        Object original = call(pi, "getSkin");
        if (original == null) throw new IllegalStateException("PlayerInfo.getSkin() null");

        Method read = getCachedMethod(nativeImageCls, "read", InputStream.class);
        Object img = read.invoke(null, new ByteArrayInputStream(e.png));

        Object tex = newDynamicTexture(img);
        String path = "inex_skins/" + key.replaceAll("[^a-z0-9_.-]", "_") + "_" + e.updatedAt;
        Object id = makeId("inex", path);

        Object tm = call(mc, "getTextureManager");
        Method reg = null;
        for (Method m : tm.getClass().getMethods()) {
            Class<?>[] p = m.getParameterTypes();
            if (m.getName().equals("register") && p.length == 2
                    && p[0] == identCls && p[1].isAssignableFrom(tex.getClass())) reg = m;
        }
        if (reg == null) throw new IllegalStateException("TextureManager.register nai");
        reg.invoke(tm, id, tex);

        Object newSkin = rebuildSkin(original, id, e.model);
        setSkin(pi, original.getClass(), newSkin);
    }

    static Object newDynamicTexture(Object img) throws Exception {
        for (Constructor<?> c : dynTexCls.getDeclaredConstructors()) {
            Class<?>[] p = c.getParameterTypes();
            c.setAccessible(true);
            if (p.length == 1 && p[0] == nativeImageCls) return c.newInstance(img);
            if (p.length == 2 && p[0] == Supplier.class && p[1] == nativeImageCls) {
                return c.newInstance(new Supplier<String>() { public String get() { return "inex_skin"; } }, img);
            }
        }
        throw new IllegalStateException("DynamicTexture constructor match hoyni");
    }

    static Object makeId(String ns, String path) throws Exception {
        Method any = null;
        for (Method m : identCls.getDeclaredMethods()) {
            Class<?>[] p = m.getParameterTypes();
            if (Modifier.isStatic(m.getModifiers()) && p.length == 2 && p[0] == String.class
                    && p[1] == String.class && m.getReturnType() == identCls) {
                if (m.getName().equals("fromNamespaceAndPath")) { m.setAccessible(true); return m.invoke(null, ns, path); }
                if (any == null) any = m;
            }
        }
        if (any != null) { any.setAccessible(true); return any.invoke(null, ns, path); }
        for (Constructor<?> c : identCls.getDeclaredConstructors()) {
            Class<?>[] p = c.getParameterTypes();
            if (p.length == 2 && p[0] == String.class && p[1] == String.class) {
                c.setAccessible(true);
                return c.newInstance(ns, path);
            }
        }
        throw new IllegalStateException("Identifier banano gelo na");
    }

    static Object rebuildSkin(Object orig, Object id, String model) throws Exception {
        Class<?> sc = orig.getClass();
        Object[] comps = (Object[]) Class.class.getMethod("getRecordComponents").invoke(sc);
        if (comps == null) throw new IllegalStateException("PlayerSkin record noy");
        Constructor<?> ctor = null;
        for (Constructor<?> c : sc.getDeclaredConstructors()) {
            if (c.getParameterTypes().length == comps.length) ctor = c;
        }
        if (ctor == null) throw new IllegalStateException("PlayerSkin canonical constructor nai");
        ctor.setAccessible(true);
        Class<?>[] types = ctor.getParameterTypes();
        Object[] args = new Object[comps.length];
        for (int i = 0; i < comps.length; i++) {
            Object comp = comps[i];
            String cname = (String) comp.getClass().getMethod("getName").invoke(comp);
            Method acc = (Method) comp.getClass().getMethod("getAccessor").invoke(comp);
            acc.setAccessible(true);
            Object val = acc.invoke(orig);
            if (cname.equals("body") || cname.equals("texture")) val = wrapTexture(types[i], id, val);
            else if (cname.equals("model") && model != null) val = pickEnum(types[i], model, val);
            args[i] = val;
        }
        return ctor.newInstance(args);
    }

    static Object wrapTexture(Class<?> type, Object id, Object old) throws Exception {
        if (type == identCls) return id;
        Class<?>[] cands = new Class<?>[] {
                old != null ? old.getClass() : null,
                load("net.minecraft.core.ClientAsset$ResourceTexture")
        };
        for (Class<?> k : cands) {
            if (k == null) continue;
            Constructor<?> best = null;
            for (Constructor<?> c : k.getDeclaredConstructors()) {
                boolean allId = c.getParameterTypes().length > 0;
                for (Class<?> p : c.getParameterTypes()) if (p != identCls) allId = false;
                if (allId && (best == null || c.getParameterTypes().length > best.getParameterTypes().length)) best = c;
            }
            if (best != null) {
                Object[] a = new Object[best.getParameterTypes().length];
                for (int i = 0; i < a.length; i++) a[i] = id;
                best.setAccessible(true);
                return best.newInstance(a);
            }
        }
        return old;
    }

    static Object pickEnum(Class<?> type, String model, Object old) {
        if (!type.isEnum()) return old;
        boolean slim = model.toLowerCase(Locale.ROOT).contains("slim");
        for (Object k : type.getEnumConstants()) {
            String n = k.toString().toUpperCase(Locale.ROOT);
            if (slim && n.contains("SLIM")) return k;
            if (!slim && (n.contains("WIDE") || n.contains("CLASSIC"))) return k;
        }
        return old;
    }

    @SuppressWarnings("rawtypes")
    static void setSkin(Object pi, Class<?> skinCls, final Object newSkin) throws Exception {
        Supplier<Object> sup = new Supplier<Object>() { public Object get() { return newSkin; } };
        for (Class<?> c = pi.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                f.setAccessible(true);
                if (Supplier.class.isAssignableFrom(f.getType())) {
                    Object cur = f.get(pi);
                    if (cur instanceof Supplier && skinCls.isInstance(((Supplier) cur).get())) {
                        f.set(pi, sup);
                        return;
                    }
                } else if (f.getType() == skinCls) {
                    f.set(pi, newSkin);
                    return;
                }
            }
        }
    }

    static String profileName(Object profile) {
        if (profile == null) return null;
        for (String n : new String[] {"name", "getName"}) {
            try {
                Object v = call(profile, n);
                if (v instanceof String) return (String) v;
            } catch (Throwable ignore) {}
        }
        return null;
    }

    static Method getCachedMethod(Class<?> cls, String name, Class<?>... paramTypes) throws Exception {
        String key = cls.getName() + "#" + name + "#" + paramTypes.length;
        Method cached = METHOD_CACHE.get(key);
        if (cached != null) return cached;
        for (Class<?> k = cls; k != null; k = k.getSuperclass()) {
            for (Method x : k.getDeclaredMethods()) {
                if (x.getName().equals(name) && x.getParameterTypes().length == paramTypes.length) {
                    boolean match = true;
                    Class<?>[] actual = x.getParameterTypes();
                    for (int i = 0; i < paramTypes.length; i++) {
                        if (!actual[i].isAssignableFrom(paramTypes[i])) { match = false; break; }
                    }
                    if (match) {
                        x.setAccessible(true);
                        METHOD_CACHE.put(key, x);
                        return x;
                    }
                }
            }
        }
        throw new NoSuchMethodException(cls.getName() + "#" + name);
    }

    static Object call(Object o, String name) throws Exception {
        Method m = getCachedMethod(o.getClass(), name);
        return m.invoke(o);
    }
}