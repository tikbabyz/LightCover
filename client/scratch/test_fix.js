const item = {
    job: "5600300950",
    item: "P113814018",
    description: "TC-3HR(BR)8.7X1200X100M",
    thickness: 8.7,
    width: 1200,
    length: 100,
    colorName: "Brown",
    materialType: "TC-3HR",
    finishedItem: "",
    itemMst: ""
};

const parseDescriptionSpecs = (description) => {
    if (!description) return { thick: 0, width: 0, length: 0 };
    try {
        const match3 = description.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/);
        if (match3) {
            return {
                thick: parseFloat(match3[1]) || 0,
                width: parseFloat(match3[2]) || 0,
                length: parseFloat(match3[3]) || 0
            };
        }
        const match2 = description.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/);
        if (match2) {
            const val1 = parseFloat(match2[1]) || 0;
            const val2 = parseFloat(match2[2]) || 0;
            return {
                thick: Math.min(val1, val2),
                width: Math.max(val1, val2),
                length: 0
            };
        }
    } catch {}
    return { thick: 0, width: 0, length: 0 };
};

const rawQuery = "5600300950";
const jobNo = item.job || item.Job || rawQuery;
const itemMst = (item.itemMst || item.ItemMst || item.finishedItem || item.FinishedItem || (item.item && !item.item.startsWith('P') ? item.item : '') || item.item || item.Item || '').trim();
const partNo = itemMst;
const itemDescription = (item.description || item.Description || '').trim();

let materialNo = (item.item?.startsWith('P') ? item.item : '').trim();
let materialDescription = '';
const specs = parseDescriptionSpecs(itemDescription);

let thickness = Number(item.thickness ?? item.Thickness ?? 0) || specs.thick || 9.0;
let width = Number(item.width ?? item.Width ?? 0) || specs.width || 1200.0;
let length = Number(item.length ?? item.Length ?? 0) || specs.length || 100.0;

// BOM response:
const foamMat = {
    materialItem: "P113814011",
    materialDescription: "TC-3HR(BR)",
    materialColor: "Brown",
    thickness: 0,
    width: 0,
    length: 0
};

if (foamMat) {
    materialNo = (foamMat.materialItem || foamMat.MaterialItem || materialNo).trim();
    materialDescription = (foamMat.materialDescription || foamMat.MaterialDescription || '').trim();
    const bomThick = Number(foamMat.thickness ?? foamMat.Thickness);
    if (bomThick > 0) thickness = bomThick;
    const bomWidth = Number(foamMat.width ?? foamMat.Width);
    if (bomWidth > 0) width = bomWidth;
    const bomLength = Number(foamMat.length ?? foamMat.Length);
    if (bomLength > 0) length = bomLength;
}

const jobObj = {
    jobNo,
    partNo,
    itemDescription,
    materialDescription,
    description: itemDescription || materialDescription || partNo,
    thicknessStd: thickness,
    widthStd: width,
    lengthStd: length,
    firstSheetThick: thickness,
};

const parsed = parseDescriptionSpecs(jobObj.itemDescription || jobObj.description);
let thick = (Number(jobObj.firstSheetThick) > 0 ? Number(jobObj.firstSheetThick) : null)
    ?? (Number(jobObj.thicknessStd) > 0 ? Number(jobObj.thicknessStd) : null)
    ?? (parsed.thick > 0 ? parsed.thick : null);
const finalThick = thick && Number(thick) > 0 ? Number(thick) : (parsed.thick > 0 ? parsed.thick : 9.0);
const finalWidth = (Number(jobObj.widthStd) > 0 ? Number(jobObj.widthStd) : null) || parsed.width || 1200.0;
const finalLength = (Number(jobObj.lengthStd) > 0 ? Number(jobObj.lengthStd) : null) || parsed.length || 100.0;

console.log("FINAL RESULT:", {
    partNo,
    materialNo,
    stdThick: finalThick,
    stdWidth: finalWidth,
    stdLength: finalLength
});
