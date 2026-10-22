const React = require('d:/chutima/Slit-project/client/node_modules/react');
const ReactPDF = require('d:/chutima/Slit-project/client/node_modules/@react-pdf/renderer');

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

const GROUP_WIDTHS = {
  item: '2.4%',
  partNo: '6.0%',
  prodName: '4.3%',
  inspection: '18.9%',
};

const COL_WIDTHS = {
  item: '2.4%',
  partNo: '6.0%',
  prodName: '4.3%',
  tapTube: '3.5%',
  lotNoTap: '6.5%',
  embossSlit: '3.5%',
  lotNoEmboss: '6.5%',
  speed: '2.1%',
  temp1: '2.1%',
  temp2: '2.1%',
  temp3: '2.1%',
  temp4: '2.1%',
  tempPipe: '2.1%',
  startTime: '2.6%',
  endTime: '2.6%',
  totalTime: '2.6%',
  qty: '4.0%',
  setting: '2.6%',
  jointIpo: '2.6%',
  splitSeam: '2.6%',
  dimNg: '2.6%',
  foamDetached: '2.6%',
  jointMark: '2.75%',
  thickNg: '2.75%',
  filmBlemish: '2.75%',
  otherNg: '2.75%',
};

const styles = StyleSheet.create({
  page: { padding: 10 },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#000',
    minHeight: 13.5,
    alignItems: 'stretch',
  },
  td: {
    borderRightWidth: 0.5,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0.5,
    paddingHorizontal: 0.3,
    overflow: 'hidden',
  },
  tdText: {
    fontSize: 5.2,
    textAlign: 'center',
    color: '#000',
  },
  tdBold: {
    fontSize: 5.2,
    fontWeight: 700,
    textAlign: 'center',
    color: '#000',
  },
});

const roll = {
  rollNum: 1,
  partNo: 'T323778003',
  productName: 'ALP6-25',
  isTwin: true,
  tube1: {
    tapTube: '2',
    lotNoTap: '2026-09-17',
    embossSlit: '2',
    lotNoEmboss: '2026-02-13',
    id1: 9, id2: 9, idAvg: 9, t1: 6, t2: 6, t3: 6, t4: 6, tAvg: 6, judgement: 'OK',
  },
  tube2: {
    tapTube: '5',
    lotNoTap: '2026-09-17',
    embossSlit: '5',
    lotNoEmboss: '2026-02-13',
    id1: 12, id2: 12, idAvg: 12, t1: 6, t2: 6, t3: 6, t4: 6, tAvg: 6, judgement: 'OK',
  },
  sameLotTap: true,
  sameLotEmboss: true,
  speed: 14,
  temp1: 490, temp2: 490, temp3: 490, temp4: 490, tempPipe: 490,
  startTime: '08:30', endTime: '11:30', totalTime: '3 ชม.',
  productQty: 2200,
  defects: { setting: 1 },
};

const renderRoll = (r) => (
  React.createElement(View, { style: styles.dataRow },
    // 1. item
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.item }] },
      React.createElement(Text, { style: styles.tdText }, r.rollNum)
    ),
    // 2. partNo
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.partNo }] },
      React.createElement(Text, { style: styles.tdBold }, r.partNo)
    ),
    // 3. prodName
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.prodName }] },
      React.createElement(Text, { style: styles.tdText }, r.productName)
    ),
    // 4. tapTube
    React.createElement(View, { style: { width: COL_WIDTHS.tapTube, flexDirection: 'column' } },
      React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0.5, minHeight: 13.5 }] },
        React.createElement(Text, { style: styles.tdText }, r.tube1.tapTube)
      ),
      React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0, minHeight: 13.5 }] },
        React.createElement(Text, { style: styles.tdText }, r.tube2.tapTube)
      )
    ),
    // 5. lotNoTap (Merged if same!)
    r.sameLotTap ? (
      React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.lotNoTap }] },
        React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube1.lotNoTap)
      )
    ) : (
      React.createElement(View, { style: { width: COL_WIDTHS.lotNoTap, flexDirection: 'column' } },
        React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0.5, minHeight: 13.5 }] },
          React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube1.lotNoTap)
        ),
        React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0, minHeight: 13.5 }] },
          React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube2.lotNoTap)
        )
      )
    ),
    // 6. embossSlit
    React.createElement(View, { style: { width: COL_WIDTHS.embossSlit, flexDirection: 'column' } },
      React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0.5, minHeight: 13.5 }] },
        React.createElement(Text, { style: styles.tdText }, r.tube1.embossSlit)
      ),
      React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0, minHeight: 13.5 }] },
        React.createElement(Text, { style: styles.tdText }, r.tube2.embossSlit)
      )
    ),
    // 7. lotNoEmboss (Merged if same!)
    r.sameLotEmboss ? (
      React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.lotNoEmboss }] },
        React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube1.lotNoEmboss)
      )
    ) : (
      React.createElement(View, { style: { width: COL_WIDTHS.lotNoEmboss, flexDirection: 'column' } },
        React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0.5, minHeight: 13.5 }] },
          React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube1.lotNoEmboss)
        ),
        React.createElement(View, { style: [styles.td, { width: '100%', flex: 1, borderBottomWidth: 0, minHeight: 13.5 }] },
          React.createElement(Text, { style: [styles.tdText, { fontSize: 4.8 }] }, r.tube2.lotNoEmboss)
        )
      )
    ),
    // 8. inspection (9 cols)
    React.createElement(View, { style: { width: GROUP_WIDTHS.inspection, flexDirection: 'column' } },
      // Tube 1
      React.createElement(View, { style: { flexDirection: 'row', flex: 1, borderBottomWidth: 0.5, borderColor: '#000', minHeight: 13.5 } },
        ['id1', 'id2', 'idAvg', 't1', 't2', 't3', 't4', 'tAvg', 'judgement'].map((k) =>
          React.createElement(View, { key: k, style: [styles.td, { width: '11.11%' }] },
            React.createElement(Text, { style: styles.tdText }, r.tube1[k])
          )
        )
      ),
      // Tube 2
      React.createElement(View, { style: { flexDirection: 'row', flex: 1, minHeight: 13.5 } },
        ['id1', 'id2', 'idAvg', 't1', 't2', 't3', 't4', 'tAvg', 'judgement'].map((k) =>
          React.createElement(View, { key: k, style: [styles.td, { width: '11.11%' }] },
            React.createElement(Text, { style: styles.tdText }, r.tube2[k])
          )
        )
      )
    ),
    // 9. Speed
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.speed }] },
      React.createElement(Text, { style: styles.tdText }, r.speed)
    ),
    // 10. Temps
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.temp1 }] }, React.createElement(Text, { style: styles.tdText }, r.temp1)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.temp2 }] }, React.createElement(Text, { style: styles.tdText }, r.temp2)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.temp3 }] }, React.createElement(Text, { style: styles.tdText }, r.temp3)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.temp4 }] }, React.createElement(Text, { style: styles.tdText }, r.temp4)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.tempPipe }] }, React.createElement(Text, { style: styles.tdText }, r.tempPipe)),
    // 11. Time
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.startTime }] }, React.createElement(Text, { style: styles.tdText }, r.startTime)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.endTime }] }, React.createElement(Text, { style: styles.tdText }, r.endTime)),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.totalTime }] }, React.createElement(Text, { style: styles.tdText }, r.totalTime)),
    // 12. Qty
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.qty }] }, React.createElement(Text, { style: styles.tdBold }, r.productQty)),
    // 13. Defects
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.setting }] }, React.createElement(Text, { style: styles.tdText }, r.defects.setting || '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.jointIpo }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.splitSeam }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.dimNg }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.foamDetached }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.jointMark }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.thickNg }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.filmBlemish }] }, React.createElement(Text, { style: styles.tdText }, '')),
    React.createElement(View, { style: [styles.td, { width: COL_WIDTHS.otherNg, borderRightWidth: 0 }] }, React.createElement(Text, { style: styles.tdText }, ''))
  )
);

const Doc = () => (
  React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
      renderRoll(roll)
    )
  )
);

ReactPDF.renderToFile(React.createElement(Doc), 'scratch/test_roll_merge.pdf')
  .then(() => console.log('Successfully rendered test_roll_merge.pdf!'))
  .catch(err => console.error('Error:', err));
